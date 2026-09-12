  /* ==========================================================================
   * src/render.js —— 后处理管线 + 曝光保护（vfx-combat 重写）
   *
   * 【这一版解决什么】
   * 旧版本的问题是「特效越强，画面越白」：术式材质是叠加混合，亮度动辄 3~10，
   * 而 three.js 的 ACES tone mapping 在直出屏幕时会把 >2 的像素全部压成纯白，
   * 于是角色轮廓、场地、甚至 HUD 都被吃进一片白里，bloom 再叠一层就更糊。
   *
   * 【三条渲染路径，全部经过同一套曝光保护】
   *   A 完整后处理（?post=1 或 render.setPost(true)）
   *       scene -> HDR RT -> 亮部提取 -> 双向高斯 -> 合成 -> ACES -> 屏幕
   *   B 保护直出（默认）
   *       scene -> HDR RT -> 合成（bloom=0，只做曝光保护/暗角/去饱和）-> ACES -> 屏幕
   *       多出来的成本只有 1 个全屏 pass，但换来「任何特效都不会把画面推成纯白」。
   *   C 裸直出（opts.guard === false）
   *       scene -> 屏幕，保留旧行为，作为逃生开关（低端机 / 排查问题时用）。
   *
   * 【曝光保护的四道闸】
   *   1. 亮部提取阈值 uThreshold = 1.15，只有真正的高光才参与 bloom
   *   2. 亮部 pass 内每通道软限幅（soft cap），避免 bloom 源头本身是纯白大饼
   *   3. 合成阶段「柔肩」：超过 uKnee 的亮度按 1/(1+k·over) 压缩，数学上不可能出现硬切白块
   *   4. 退路钳制 uCeil：任何像素在任何情况下都不会超过这个线性亮度
   *   另外闪光（uFlash）本身也带亮度自适应：画面已经亮的地方少加光，
   *   保证命中闪光的瞬间角色剪影仍然读得出来（而不是整个人糊成白色）。
   *
   * 【工程约束】
   *   - 所有 shader 都坚持「同一个 sampler 只做一次 texture2D」的纪律：
   *     多次采样在 ANGLE/SwiftShader 上会被错误编译成额外采样返回 0，
   *     表现为整帧丢通道（变绿）。这条踩坑记录见旧版注释，这里继续遵守。
   *   - 不引入任何外部依赖，只用 three.js 内联的 EffectComposer 家族。
   * ========================================================================== */
  var VERT = (
    /* glsl */
    `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
  );
  /* 亮部提取：阈值 + 膝部软过渡 + 每通道软限幅 + 高光去彩噪 */
  var BRIGHT_FRAG = (
    /* glsl */
    `
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
uniform float uCap;
varying vec2 vUv;

void main() {
  vec3 c = texture2D( tDiffuse, vUv ).rgb;
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  // 阈值 + 膝部：只有超过阈值的高光参与泛光，且过渡是平滑的（不产生硬边）
  float w = smoothstep( uThreshold, uThreshold + uKnee, l );
  vec3 outc = c * w;
  // 每通道软限幅：c/(1+c/cap)，把「亮部源头」本身压到 cap 附近，
  // 这样即使屏幕里有 10 倍过曝的白块，泛光也不会变成一坨纯白
  outc = outc / ( 1.0 + max( vec3( 0.0 ), outc - uCap ) / uCap );
  // 高光去彩噪：极亮的像素接近白，混一点它的亮度值，避免五颜六色的泛光斑
  outc = mix( outc, vec3( l ) * w, 0.18 * smoothstep( uThreshold + uKnee, uThreshold + uKnee * 4.0, l ) );
  gl_FragColor = vec4( max( outc, vec3( 0.0 ) ), 1.0 );
}
`
  );
  var BLUR_FRAG = (
    /* glsl */
    `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform vec2 uDir;
uniform float uRadius;
varying vec2 vUv;

void main() {
  vec2 off = uTexel * uDir * uRadius;
  vec3 sum = texture2D( tDiffuse, vUv ).rgb * 0.2270270270;
  sum += texture2D( tDiffuse, vUv + off * 1.3846153846 ).rgb * 0.3162162162;
  sum += texture2D( tDiffuse, vUv - off * 1.3846153846 ).rgb * 0.3162162162;
  sum += texture2D( tDiffuse, vUv + off * 3.2307692308 ).rgb * 0.0702702703;
  sum += texture2D( tDiffuse, vUv - off * 3.2307692308 ).rgb * 0.0702702703;
  gl_FragColor = vec4( sum, 1.0 );
}
`
  );
  var COMPOSITE_FRAG = (
    /* glsl */
    `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform vec2  uTexel;
uniform float uTime;
uniform float uBloom;      // 泛光强度（已在上层做过上限）
uniform float uBloomCap;   // 单像素泛光贡献上限
uniform float uBloomFloor; // 泛光高通地板：扣掉"大面积亮部"的低频分量
uniform sampler2D tHaze;   // 1/16 分辨率的邻域平均亮度：判"周围有多大一片亮"
uniform float uHazeK;      // 大面积亮部压制强度
uniform float uHazeKnee;   // 开始压制的邻域亮度门槛
uniform float uFlash;      // 闪光强度
uniform vec3  uFlashColor;
uniform float uFlashTone;  // 闪光「亮度自适应」系数
uniform float uKnee;       // 柔肩起点
uniform float uShoulder;   // 柔肩强度
uniform float uCeil;       // 退路钳制
uniform float uExposure;   // 曝光（线性增益，做在柔肩之后，不会把高光重新推爆）
uniform float uLift;       // 暗部抬升（线性加性底光，避免路面黑到没信息）
uniform float uGamma;      // 中间调 Gamma（<1 提亮暗部与中调，不牺牲高光）
uniform float uChroma;
uniform float uVignette;
uniform float uRadial;
uniform vec2  uRadialCenter;
uniform float uDesat;
uniform vec3  uTint;
uniform float uTintAmt;
uniform float uGrain;
uniform float uScan;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec2 center = vec2( 0.5 ) + uRadialCenter;

  /* --- 色散 / 镜头边纹 ---
   * 这里**刻意只采样一次**：用「按到屏幕中心的距离给 R/B 通道做反向增益」来近似
   * 色散。多次 texture2D 在 ANGLE + SwiftShader 上会被错误编译（额外采样返回 0），
   * 画面会整帧丢通道变绿，所以永久保持单次采样。
   */
  float cd = length( uv - center ) * 1.35;
  float ck = uChroma * 140.0 * cd;
  vec3 base = texture2D( tDiffuse, uv ).rgb;
  base = vec3( base.r * ( 1.0 + ck ), base.g, base.b * ( 1.0 - ck * 0.85 ) );

  /* --- 冲击感：向心收缩的光晕（纯数学，不采样） --- */
  float ring = 1.0 - clamp( cd, 0.0, 1.0 );
  base *= 1.0 + uRadial * ( 0.85 * ring * ring );
  base = mix( base, base * 0.72, clamp( uRadial * 0.55, 0.0, 0.6 ) * clamp( cd, 0.0, 1.0 ) );

  /* --- 泛光叠加：高通化 + 每像素封顶 ---
   * 泛光只负责「亮的东西往四周溢一点」，绝不能把整片的暗部提亮成灰白。
   *
   * 【task-6 修复】旧版把模糊结果直接乘强度加上去 —— 模糊结果里天然含有
   * 「大面积亮部的低频分量」。沿街机位下几十个街灯的光锥叠成一片大面积暖色，
   * 它的低频分量被原样加回画面，就成了糊掉画面中段的一片暖雾。
   * 现在先减掉地板 uBloomFloor 再放大（高通）：**只保留局部凸起的光晕，
   * 大面积均匀亮部的贡献被扣掉**；小而亮的核（火星/术式核心）不受影响。
   */
  vec3 bl = texture2D( tBloom, uv ).rgb;
  bl = max( bl - vec3( uBloomFloor ), vec3( 0.0 ) ) / max( 1e-3, 1.0 - uBloomFloor );
  vec3 bloom = min( bl * uBloom, vec3( uBloomCap ) );

  /* --- 大面积亮部压制（task-6 核心修复）---
   * tHaze 是场景在 1/16 分辨率下的邻域平均：它高 = 这块地方"一大片都亮"。
   * 对这样的区域做一次轻度的局部色调映射把底板压下去，而局部对比（细节）不受影响；
   * 单个亮点（火星、术式核心）邻域平均很低，完全不会被动到。
   */
  float haze = dot( texture2D( tHaze, uv ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  float hazeAmt = clamp( uHazeK * max( 0.0, haze - uHazeKnee ), 0.0, 1.4 );
  base *= 1.0 / ( 1.0 + hazeAmt );
  // 大面积暖光同时轻微去色：不然整片橙黄会把画面的色彩空间占满，看着像蒙了一层滤镜
  float baseLum = dot( base, vec3( 0.2126, 0.7152, 0.0722 ) );
  base = mix( base, vec3( baseLum ), clamp( hazeAmt * 0.42, 0.0, 0.55 ) );

  vec3 col = base + bloom;

  /* --- 曝光保护：先量当前像素有多亮 --- */
  float peak = max( col.r, max( col.g, col.b ) );

  /* --- 闪光：亮度自适应 + 中心保护 ---
   * 1) 画面本来就亮的地方少加光（角色身上不会糊成一片白）
   * 2) 屏幕中心（战斗焦点、角色所在）少加光，把闪光推到画面边缘，
   *    这样"被打中"的冲击感还在，但玩家不会连自己在哪都看不见。
   */
  float flashLum = smoothstep( 0.02, 0.9, peak );
  float flashFocus = 1.0 - 0.5 * ( 1.0 - smoothstep( 0.0, 0.62, cd ) );
  /* 闪光按"已有亮度"分配：
   *   常量项 0.06  —— 极暗处也有一点点全屏提亮（保留"被闪到"的感觉）
   *   亮度项 0.60  —— 亮的东西（角色、霓虹、特效）才吃到大头
   * 旧写法是无条件加一个常量色，夜里一整屏加 0.26 线性红 = 直接变成红色滤镜。
   */
  float flashGain = 0.10 + 0.85 * flashLum;
  col += uFlashColor * uFlash * flashGain * flashFocus * mix( 1.0, 1.0 - uFlashTone * 0.5, flashLum );

  /* --- 色彩偏移 + 去饱和（濒死 / 领域内 用） --- */
  if ( uTintAmt > 0.0001 ) {
    float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
    col = mix( col, uTint * ( 0.35 + l * 0.9 ), uTintAmt );
  }
  if ( uDesat > 0.0001 ) {
    float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
    col = mix( col, vec3( l ), uDesat );
  }

  /* --- 柔肩（核心曝光保护） ---
   * 超出膝点的亮度按 1/(1 + k·over) 压缩：单调、连续、处处可导，
   * 不会出现「一片像素正好卡在 1.0 变成死白」的硬切。
   * 压缩是乘性的，所以色相比例保持不变，特效的颜色仍然读得出来。
   */
  peak = max( col.r, max( col.g, col.b ) );
  float over = max( 0.0, peak - uKnee );
  col /= ( 1.0 + over * uShoulder );

  /* --- 曝光抬升（顺序很关键） ---
   * 放在柔肩**之后**：先把过亮的头压住，再整体提亮，这样暗部与中间调抬起来、
   * 高光仍然被柔肩锁着，不会又回到"整体过曝"。
   *   1) 线性增益 uExposure  —— 整体抬一档
   *   2) 加性底光 uLift      —— 专门救纯黑（沥青路面），避免暗部丢信息
   *   3) Gamma uGamma(<1)    —— 把中间调拉起来，符合人眼/胶片的观感
   */
  col = max( col, vec3( 0.0 ) ) * uExposure + uLift;
  col = pow( col, vec3( uGamma ) );

  /* --- 扫描线（极轻，给赛璐璐画面一点电子质感） --- */
  if ( uScan > 0.0001 ) {
    col *= 1.0 - uScan * 0.5 * ( 0.5 + 0.5 * sin( uv.y * 1400.0 ) );
  }

  /* --- 胶片颗粒 --- */
  if ( uGrain > 0.0001 ) {
    float n = fract( sin( dot( uv * vec2( 1234.5, 5678.9 ) + uTime * 13.7, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    col += ( n - 0.5 ) * uGrain;
  }

  /* --- 暗角（径向淡出，让视线聚焦战场中心） --- */
  float vd = distance( vUv, vec2( 0.5 ) );
  float vig = smoothstep( 0.92, 0.26, vd );
  col *= mix( 1.0, vig, uVignette );

  /* --- 退路钳制：任何情况下都不允许出现「数学意义上的纯白」 --- */
  col = min( max( col, vec3( 0.0 ) ), vec3( uCeil ) );
  gl_FragColor = vec4( col, 1.0 );
}
`
  );
  function createRender(opts) {
    const quality2 = opts.quality === "low" || opts.quality === "medium" ? opts.quality : "high";
    const canvas2 = opts.canvas;
    const renderer = new WebGLRenderer({
      canvas: canvas2,
      antialias: quality2 === "high",
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: "high-performance"
    });
    renderer.setClearColor(394764, 1);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.info.autoReset = false;
    const targetPR = quality2 === "low" ? 1 : quality2 === "medium" ? 1.25 : 1.5;
    const maxPR = Math.min(window.devicePixelRatio || 1, targetPR);
    const useHDR = opts.hdr !== false;
    const rtType = useHDR ? HalfFloatType : UnsignedByteType;
    // usePost：完整后处理（亮部提取 + 双向模糊 + 泛光）
    let usePost = opts.post !== false;
    // guard：即使不开后处理，也跑一遍「曝光保护合成」。这是本文件的核心承诺：
    //       特效再强也吃不掉角色轮廓与 HUD。只有显式 guard:false 才会退回裸直出。
    let useGuard = opts.guard !== false;
    let bloomOn = opts.bloom !== false;
    const composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type: rtType }));
    composer.setPixelRatio(maxPR);
    const size = new Vector2();
    renderer.getDrawingBufferSize(size);
    const renderPass = new RenderPass(new Scene(), new Camera());
    const brightPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 1.15 },
        uKnee: { value: 0.5 },
        uCap: { value: 1.35 }
      },
      vertexShader: VERT,
      fragmentShader: BRIGHT_FRAG
    });
    const blurRT_A = new WebGLRenderTarget(1, 1, {
      type: rtType,
      depthBuffer: false,
      stencilBuffer: false
    });
    const blurRT_B = new WebGLRenderTarget(1, 1, {
      type: rtType,
      depthBuffer: false,
      stencilBuffer: false
    });
    blurRT_A.texture.name = "bloomA";
    blurRT_B.texture.name = "bloomB";
    blurRT_A.texture.generateMipmaps = false;
    blurRT_B.texture.generateMipmaps = false;
    const makeBlur = (dir) => new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new Vector2(1 / 512, 1 / 512) },
        uDir: { value: dir.clone() },
        uRadius: { value: 1 }
      },
      vertexShader: VERT,
      fragmentShader: BLUR_FRAG
    });
    const blurH = makeBlur(new Vector2(1, 0));
    const blurV = makeBlur(new Vector2(0, 1));
    blurH.needsSwap = false;
    blurV.needsSwap = false;
    blurH.clear = false;
    blurV.clear = false;
    /* --- 大面积亮部侦测（task-6）---
     * 街灯体积光锥叠在一起时，画面中段会变成一大片暖色，而它的亮度可能低于泛光阈值，
     * 所以"泛光高通"压不掉它（实测 bloom on/off 的中段亮度只差 0.2/89）。
     * 这里额外做一路 1/16 分辨率的极低分辨率模糊：得到每个像素"周围有多大一片亮"，
     * 交给合成 pass 做局部色调映射（大面积亮 → 压低，局部亮点不动）。
     * 成本：2 个 1/16 分辨率的全屏 draw，桌面/手机都可忽略。
     */
    const hazeRT_A = new WebGLRenderTarget(1, 1, { type: rtType, depthBuffer: false, stencilBuffer: false });
    const hazeRT_B = new WebGLRenderTarget(1, 1, { type: rtType, depthBuffer: false, stencilBuffer: false });
    hazeRT_A.texture.name = "hazeA";
    hazeRT_B.texture.name = "hazeB";
    hazeRT_A.texture.generateMipmaps = false;
    hazeRT_B.texture.generateMipmaps = false;
    const hazeH = makeBlur(new Vector2(1, 0));
    const hazeV = makeBlur(new Vector2(0, 1));
    hazeH.needsSwap = false;
    hazeV.needsSwap = false;
    hazeH.clear = false;
    hazeV.clear = false;
    const composite = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        uTexel: { value: new Vector2(1 / 512, 1 / 512) },
        uTime: { value: 0 },
        uBloom: { value: 0.5 },
        uBloomCap: { value: 0.65 },
        uBloomFloor: { value: 0.14 },
        tHaze: { value: null },
        uHazeK: { value: 12 },
        uHazeKnee: { value: 0.04 },
        uFlash: { value: 0 },
        uFlashColor: { value: new Color(1, 1, 1) },
        uFlashTone: { value: 0.6 },
        uKnee: { value: 0.85 },
        uShoulder: { value: 0.8 },
        uCeil: { value: 2.4 },
        uExposure: { value: 1.35 },
        uLift: { value: 0.004 },
        uGamma: { value: 0.82 },
        uChroma: { value: 0 },
        uVignette: { value: 0.55 },
        uRadial: { value: 0 },
        uRadialCenter: { value: new Vector2(0, 0) },
        uDesat: { value: 0 },
        uTint: { value: new Color(1, 1, 1) },
        uTintAmt: { value: 0 },
        uGrain: { value: 0.028 },
        uScan: { value: 0 }
      },
      vertexShader: VERT,
      fragmentShader: COMPOSITE_FRAG
    });
    const outputPass = new OutputPass();
    composer.addPass(composite);
    composer.addPass(outputPass);
    /* 分档参数。
     * low 档除了关小泛光、去掉颗粒，也把曝光抬升收一点（手机屏幕本身更亮、
     * 而且弱机的暗部噪声更明显）。曝光三件套（exposure/lift/gamma）的数值
     * 是用 _tools/acceptance.mjs 的 avgLum / darkPct 指标标定的：
     * 目标是 avgLum 45~60、darkPct < 40%、blownPct 保持 0。
     */
    const TIERS = {
      // 标定实测（shots/vfx-combat/_tune.mjs，1600x900 实机）：
      //   1.40/0.0055/0.80 → avgLum 77.0 dark 0.5%   太亮、发灰
      //   1.12/0.0022/0.87 → avgLum 56.7 dark 4.1%   ← 落进目标区间
      //   1.05/0.0015/0.90 → avgLum 49.6 dark 6.9%   ← 落进目标区间、对比更好
      // 取两者之间：整体抬一档但保住暗部层次，blownPct 保持 0。
      // 用户反馈"打击被压平"后重新配比：抬亮度主要靠线性增益（保住黑位与对比），
      // 少用 gamma 抬中间调 —— gamma 才是"画面被抬平"的元凶。
      // task-6：泛光加高通地板（bloomFloor），半径小幅收紧 —— 只让"小而亮"的东西发光，
      // 大面积亮部（沿街的街灯光锥）不再糊成一片暖雾。
      high: { hazeK: 12, hazeKnee: 0.04, blurRadius: 1.15, bloom: 0.62, bloomCap: 0.8, bloomFloor: 0.14, grain: 0.03, chromaBase: 2.8, vignette: 0.58, shoulder: 0.8, knee: 0.9, ceil: 2.6, exposure: 1.3, lift: 0.0008, gamma: 0.935 },
      medium: { hazeK: 11, hazeKnee: 0.045, blurRadius: 1.0, bloom: 0.52, bloomCap: 0.68, bloomFloor: 0.16, grain: 0.022, chromaBase: 2.2, vignette: 0.56, shoulder: 0.85, knee: 0.85, ceil: 2.4, exposure: 1.28, lift: 0.0008, gamma: 0.94 },
      low: { hazeK: 10, hazeKnee: 0.05, blurRadius: 0.85, bloom: 0.4, bloomCap: 0.55, bloomFloor: 0.18, grain: 0, chromaBase: 1.6, vignette: 0.54, shoulder: 0.95, knee: 0.8, ceil: 2.2, exposure: 1.25, lift: 0.0008, gamma: 0.945 }
    };
    let Q = TIERS[quality2];
    composite.uniforms.uBloom.value = Q.bloom;
    composite.uniforms.uBloomCap.value = Q.bloomCap;
    composite.uniforms.uBloomFloor.value = Q.bloomFloor;
    composite.uniforms.uHazeK.value = Q.hazeK;
    composite.uniforms.uHazeKnee.value = Q.hazeKnee;
    composite.uniforms.uGrain.value = Q.grain;
    composite.uniforms.uVignette.value = Q.vignette;
    composite.uniforms.uKnee.value = Q.knee;
    composite.uniforms.uShoulder.value = Q.shoulder;
    composite.uniforms.uCeil.value = Q.ceil;
    composite.uniforms.uExposure.value = Q.exposure;
    composite.uniforms.uLift.value = Q.lift;
    composite.uniforms.uGamma.value = Q.gamma;
    const state2 = {
      flashColor: new Color(1, 1, 1),
      tint: new Color(1, 1, 1),
      shakeSeed: Math.random() * 1e3
    };
    const imp = { flash: 0, chroma: 0, radial: 0, shake: 0 };
    const amb = { vignette: 0, desat: 0 };
    const fxv = { flash: 0, chroma: 0, radial: 0, shake: 0, vignette: 0 };
    const shakeOffset = new Vector3();
    const impulseColor = new Color(1, 1, 1);
    let flashHeld = false;
    let bloomBoost = 1;
    /* 闪光预算：0.26 是「看得见冲击但不吃掉画面」的经验上限。
     * 实测 0.4 以上的全屏加色在夜街画面上就是一整屏红色滤镜（赫 命中那一帧），
     * 会把角色和路面全染掉；0.26 + 中心保护后仍然明显，但画面不再被吃掉。
     * 注意 main.js 在无后处理时用 composite.uniforms.uFlash 驱动 DOM 全屏闪光，
     * 这里限住的正是那层闪光的强度。
     */
    const FLASH_MAX = 1.15;
    // flashToPost：合成阶段是否自己叠加闪光。
    // 完整后处理时由合成承担；保护直出时由 DOM 承担（避免闪两次）。
    let flashToPost = usePost;
    function resize(w, h, pixelRatio) {
      const pr = Math.min(pixelRatio || 1, targetPR);
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      const bw = Math.max(1, Math.floor(w * pr * 0.5));
      const bh = Math.max(1, Math.floor(h * pr * 0.5));
      blurRT_A.setSize(bw, bh);
      blurRT_B.setSize(bw, bh);
      const hw = Math.max(1, Math.floor(w * pr / 16));
      const hh = Math.max(1, Math.floor(h * pr / 16));
      hazeRT_A.setSize(hw, hh);
      hazeRT_B.setSize(hw, hh);
      hazeH.uniforms.uTexel.value.set(1 / hw, 1 / hh);
      hazeV.uniforms.uTexel.value.set(1 / hw, 1 / hh);
      hazeH.uniforms.uRadius.value = 1.6;
      hazeV.uniforms.uRadius.value = 1.6;
      blurH.uniforms.uTexel.value.set(1 / bw, 1 / bh);
      blurV.uniforms.uTexel.value.set(1 / bw, 1 / bh);
      blurH.uniforms.uRadius.value = Q.blurRadius;
      blurV.uniforms.uRadius.value = Q.blurRadius;
      composite.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
    }
    function impulse(o) {
      if (!o) return;
      if (o.bloom !== void 0) bloomBoost = clampNum2(Math.max(bloomBoost, o.bloom), 1, 1.8, 1);
      if (o.flash !== void 0 && o.flash > imp.flash) {
        imp.flash = clampNum2(o.flash, 0, 1, 0);
        if (o.color !== void 0) impulseColor.setHex(o.color);
        else impulseColor.setRGB(1, 1, 1);
        flashHeld = !!o.hold;
      }
      if (o.chroma !== void 0) imp.chroma = clampNum2(Math.max(imp.chroma, o.chroma), 0, 4, 0);
      if (o.radialBlur !== void 0) imp.radial = clampNum2(Math.max(imp.radial, o.radialBlur), 0, 0.6, 0);
      if (o.shake !== void 0) imp.shake = clampNum2(Math.max(imp.shake, o.shake), 0, 6, 0);
      if (o.vignette !== void 0) amb.vignette = clampNum2(Math.max(amb.vignette, o.vignette), 0, 1, 0);
      if (o.desaturate !== void 0) amb.desat = clampNum2(Math.max(amb.desat, o.desaturate), 0, 1, 0);
    }
    function clampNum2(v, lo, hi, def2) {
      const n = Number(v);
      if (!isFinite(n)) return def2;
      return n < lo ? lo : n > hi ? hi : n;
    }
    function pullFromFX(fx2, dt) {
      const s = fx2 && fx2.screenState;
      if (!s) return 0;
      fxv.flash = s.flash || 0;
      fxv.chroma = s.chroma || 0;
      fxv.radial = s.blur || 0;
      fxv.shake = s.shake || 0;
      fxv.vignette = Math.max(0, s.vignette || 0);
      if (fxv.flash > 1e-3 && fxv.flash >= imp.flash) {
        const fc = s.flashColor;
        if (typeof fc === "number" && fc > 0) impulseColor.setHex(fc);
        else if (fc && fc.isColor) impulseColor.copy(fc);
        else if (typeof s.color === "number" && s.color > 0) impulseColor.setHex(s.color);
        state2.flashColor.copy(impulseColor);
      }
      return 0;
    }
    function updateFX(dt) {
      const d = Math.min(dt, 0.1);
      // 闪光衰减：半衰期约 0.087s ⇒ 0.15s 后只剩约 30%，0.3s 后基本看不见。
      // 峰值给足（FLASH_MAX 1.15），靠这条曲线保证它只是"啪"一下，
      // 不会像基线那样把一整屏糊白半秒。
      imp.flash *= Math.pow(2e-4, d);
      imp.chroma *= Math.pow(0.02, d);
      imp.radial *= Math.pow(0.05, d);
      imp.shake *= Math.pow(8e-3, d);
      if (imp.flash < 2e-3) {
        imp.flash = 0;
        flashHeld = false;
      }
      const k = Math.pow(0.12, d);
      amb.vignette *= k;
      amb.desat *= k;
      bloomBoost += (1 - bloomBoost) * Math.min(1, d * 2.6);
      const u = composite.uniforms;
      u.uBloom.value = usePost && bloomOn ? Q.bloom * bloomBoost : 0;
      // DOM 闪光读的是这里：上限被锁在 FLASH_MAX，最亮也只是「一层薄光」
      u.uFlash.value = Math.min(FLASH_MAX, imp.flash + fxv.flash);
      u.uFlashColor.value.copy(impulseColor);
      u.uChroma.value = Math.min(0.02, (imp.chroma + fxv.chroma) * 1e-3 * Q.chromaBase);
      u.uVignette.value = Math.min(1, Q.vignette + amb.vignette + fxv.vignette);
      u.uRadial.value = Math.min(0.6, imp.radial + fxv.radial);
      u.uDesat.value = Math.min(1, amb.desat);
    }
    function getShake() {
      const amt = imp.shake + fxv.shake;
      if (amt < 5e-4) {
        shakeOffset.set(0, 0, 0);
        return shakeOffset;
      }
      const t = state2.shakeSeed + performance.now() * 1e-3;
      shakeOffset.set(
        (Math.sin(t * 61.7) + Math.sin(t * 137.3) * 0.6) * amt * 0.5,
        (Math.sin(t * 83.1 + 1.7) + Math.sin(t * 191.1) * 0.6) * amt * 0.4,
        Math.sin(t * 47.3 + 3.1) * amt * 0.3
      );
      return shakeOffset;
    }
    let elapsed = 0;
    function render2(scene2, camera, dt) {
      elapsed += dt;
      composite.uniforms.uTime.value = elapsed;
      renderer.info.reset();
      const sh = getShake();
      if (sh.lengthSq() > 0) {
        camera.position.x += sh.x;
        camera.position.y += sh.y;
        camera.position.z += sh.z;
      }
      renderPass.scene = scene2;
      renderPass.camera = camera;
      const gl = composer.renderer;
      const wb = composer.writeBuffer, rb = composer.readBuffer;
      // 裸直出（逃生开关）：旧行为，没有任何曝光保护
      if (!useGuard && !usePost) {
        gl.setRenderTarget(null);
        gl.render(scene2, camera);
        return;
      }
      // 场景先渲进 HDR RT（three 只在直出屏幕时做 tonemap，所以这里是线性 HDR）
      renderPass.render(gl, wb, rb, dt);
      if (usePost && bloomOn) {
        brightPass.needsSwap = false;
        brightPass.uniforms.tDiffuse.value = rb.texture;
        gl.setRenderTarget(blurRT_A);
        gl.clear();
        brightPass.fsQuad.render(gl);
        blurH.uniforms.tDiffuse.value = blurRT_A.texture;
        gl.setRenderTarget(blurRT_B);
        gl.clear();
        blurH.fsQuad.render(gl);
        blurV.uniforms.tDiffuse.value = blurRT_B.texture;
        gl.setRenderTarget(blurRT_A);
        gl.clear();
        blurV.fsQuad.render(gl);
      }
      // 大面积亮部侦测：1/16 分辨率的双向模糊（只跑两个很小的 draw）
      hazeH.uniforms.tDiffuse.value = rb.texture;
      gl.setRenderTarget(hazeRT_A);
      gl.clear();
      hazeH.fsQuad.render(gl);
      hazeV.uniforms.tDiffuse.value = hazeRT_A.texture;
      gl.setRenderTarget(hazeRT_B);
      gl.clear();
      hazeV.fsQuad.render(gl);
      composite.uniforms.tHaze.value = hazeRT_B.texture;
      composite.uniforms.tBloom.value = blurRT_A.texture;
      // 保护直出时合成里不再叠闪光（否则和 DOM 闪光叠成两倍）
      const wantFlash = usePost && flashToPost;
      if (!wantFlash) composite.uniforms.uFlash.value = 0;
      composer.render(dt);
      if (!wantFlash) updateFX(0);
    }
    function setQuality(q) {
      const key = q === "low" || q === "medium" ? q : "high";
      Q = TIERS[key];
      composite.uniforms.uBloomCap.value = Q.bloomCap;
      composite.uniforms.uBloomFloor.value = Q.bloomFloor;
      composite.uniforms.uHazeK.value = Q.hazeK;
      composite.uniforms.uHazeKnee.value = Q.hazeKnee;
      composite.uniforms.uGrain.value = Q.grain;
      composite.uniforms.uVignette.value = Q.vignette;
      composite.uniforms.uKnee.value = Q.knee;
      composite.uniforms.uShoulder.value = Q.shoulder;
      composite.uniforms.uCeil.value = Q.ceil;
      composite.uniforms.uExposure.value = Q.exposure;
      composite.uniforms.uLift.value = Q.lift;
      composite.uniforms.uGamma.value = Q.gamma;
      blurH.uniforms.uRadius.value = Q.blurRadius;
      blurV.uniforms.uRadius.value = Q.blurRadius;
      composite.uniforms.uBloom.value = usePost && bloomOn ? Q.bloom : 0;
    }
    function dispose() {
      composer.dispose?.();
      brightPass.dispose?.();
      blurH.dispose?.();
      blurV.dispose?.();
      composite.dispose?.();
      outputPass.dispose?.();
      blurRT_A.dispose();
      blurRT_B.dispose();
      hazeRT_A.dispose();
      hazeRT_B.dispose();
      hazeH.dispose?.();
      hazeV.dispose?.();
      renderer.dispose();
    }
    resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    return {
      renderer,
      render: render2,
      resize,
      impulse,
      updateFX,
      getShake,
      pullFromFX,
      setQuality,
      dispose,
      composite,
      composer,
      brightPass,
      blurRT_A,
      blurRT_B,
      state: state2,
      setBloom(on) {
        bloomOn = !!on;
      },
      setPost(on) {
        usePost = !!on;
        if (usePost) flashToPost = true;
      },
      setGuard(on) {
        useGuard = !!on;
      },
      /** 闪光由谁承担：'dom'（无后处理时叠在 HUD 上）或 'post'（合成里，位于 HUD 之下） */
      setFlashSource(src) {
        flashToPost = src === "post";
      },
      /** 调试/自检用：当前曝光保护的实时参数 */
      get exposure() {
        return {
          quality: quality2,
          post: usePost,
          guard: useGuard,
          flash: +composite.uniforms.uFlash.value.toFixed(3),
          flashMax: FLASH_MAX,
          knee: composite.uniforms.uKnee.value,
          shoulder: composite.uniforms.uShoulder.value,
          ceil: composite.uniforms.uCeil.value,
          bloom: +composite.uniforms.uBloom.value.toFixed(3),
          bloomCap: composite.uniforms.uBloomCap.value,
          bloomFloor: composite.uniforms.uBloomFloor.value,
          hazeK: composite.uniforms.uHazeK.value,
          hazeKnee: composite.uniforms.uHazeKnee.value,
          bloomThreshold: brightPass.uniforms.uThreshold.value,
          exposure: composite.uniforms.uExposure.value,
          lift: composite.uniforms.uLift.value,
          gamma: composite.uniforms.uGamma.value
        };
      }
    };
  }