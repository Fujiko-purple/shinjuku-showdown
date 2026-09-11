  var TOON_FRAG = (
    /* glsl */
    `
  #include <common>
  #include <fog_pars_fragment>
  #include <color_pars_fragment>
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform vec3 uEmissive;
  uniform vec3 uInk;
  uniform vec3 uLightDir;
  uniform vec3 uAmbient;
  uniform vec3 uLightColor;
  uniform vec3 uFill;
  uniform float uBands;
  uniform float uRimPower;
  uniform float uRimStrength;
  uniform float uEmissiveI;
  uniform float uInkAmount;
  uniform float uFlash;
  uniform float uAlpha;
  uniform float uOpacity;
  uniform float uUseMap;
  uniform float uUvScale;
  uniform float uOutline;
  uniform float uGlowOnly;
  #ifdef USE_MAP
  uniform sampler2D uMap;
  #endif
  varying vec3 vNrm;
  varying vec3 vWPos;
  varying vec2 vUv2;

  void main() {
    vec3 N = normalize( vNrm );
    vec3 V = normalize( cameraPosition - vWPos );
    float ndv = clamp( dot( N, V ), 0.0, 1.0 );
    float fres = pow( 1.0 - ndv, max( uRimPower, 0.35 ) );

    // ---- 反壳描边：只输出一圈深色，套在角色外层，保证任何背景上剪影都清楚 ----
    if ( uOutline > 0.0 ) {
      vec3 oc = mix( uInk, uRim, smoothstep( 0.1, 1.0, fres ) * 0.35 );
      gl_FragColor = vec4( oc, uAlpha * uOpacity );
      #include <fog_fragment>
      return;
    }

    vec3 base = uColor;
    #ifdef USE_COLOR
      base *= vColor;
    #endif
    #ifdef USE_MAP
      vec3 texc = texture2D( uMap, vUv2 * uUvScale ).rgb;
      base = mix( base, base * texc * 1.32, uUseMap );
    #endif

    // ---- 三段色阶（固定方向光，不依赖 scene 真实光源）----
    float ndl = dot( N, uLightDir );
    float bands = max( uBands, 1.0 );
    float lit = floor( clamp( ndl * 0.5 + 0.5, 0.0, 0.9999 ) * bands ) / ( bands - 1.0 + 1e-4 );
    lit = clamp( lit, 0.0, 1.0 );
    vec3 col = base * mix( uAmbient, uLightColor, lit );
    // 半球补光：让暗部保留形体而不是死黑
    col += base * uFill * ( N.y * 0.5 + 0.5 );
    // 背光面补一点冷色，形体不至于塌掉
    col += base * 0.055 * ( 1.0 - lit );

    // ---- 边缘压深：形体交界处的墨线，强光下也不会糊成一片 ----
    float ink = smoothstep( 0.42, 1.0, fres ) * uInkAmount;
    col = mix( col, uInk, ink );

    // ---- 边缘光（角色咒力色）叠在最外层 ----
    col += uRim * fres * uRimStrength;

    // ---- 自发光 ----
    col += uEmissive * uEmissiveI;

    // ---- 受击闪白：保留明暗结构，避免整体糊成白剪影 ----
    if ( uFlash > 0.0 ) {
      float f = clamp( uFlash, 0.0, 1.0 );
      vec3 flashCol = mix( base * 1.5 + uRim * 0.4 + uEmissive * 0.5, vec3( 1.0 ), 0.42 );
      col = mix( col, flashCol, f );
      col += uRim * f * fres * 0.5;
    }

    if ( uGlowOnly > 0.0 ) {
      col += uColor * fres * uGlowOnly;
    }
    // 压回合理亮度区间：整体过曝会丢形体
    float over = max( 0.0, max( max( col.r, col.g ), col.b ) - 1.35 );
    col = col / ( 1.0 + over * 0.85 );
    gl_FragColor = vec4( col, uAlpha * uOpacity );
    #include <fog_fragment>
  }
  `
  );
