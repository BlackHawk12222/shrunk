import * as THREE from 'three';
import { tex, fbm } from './util.js';

const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -10));
let rippleIdx = 0;

export const waterMat = (() => {
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.5, 0.6, 0.3) },
    uSky: { value: new THREE.Color('#5d8fd6') }, uHorizon: { value: new THREE.Color('#d9e6ef') },
    uScale: { value: 0.004 }, uNormal: { value: null }, uRipples: { value: ripples },
  }]);
  u.uNormal.value = tex('water_n');
  u.uRipples.value = ripples;
  return new THREE.ShaderMaterial({
    uniforms: u, transparent: true, fog: true, depthWrite: false,
    vertexShader: `
      attribute float aR; varying vec3 vW; varying float vR;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vR = aR;
        vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D uNormal; uniform float uTime; uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uHorizon;
      uniform float uScale; uniform vec4 uRipples[8];
      varying vec3 vW; varying float vR;
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec2 p = vW.xz*uScale;
        vec3 n1 = texture2D(uNormal, p*0.9 + vec2(uTime*0.020, uTime*0.013)).xyz*2.0-1.0;
        vec3 n2 = texture2D(uNormal, p*2.3 - vec2(uTime*0.017,-uTime*0.024)).xyz*2.0-1.0;
        vec3 n = vec3(n1.x+n2.x*0.6, 5.0, n1.y+n2.y*0.6);
        for(int i=0;i<8;i++){
          vec4 r = uRipples[i]; float age = uTime - r.w;
          if(age < 0.0 || age > 3.5) continue;
          float d = distance(vW.xz, r.xy);
          float front = age*60.0;
          float wave = sin(d*0.28 - age*10.0)*exp(-age*1.1)*smoothstep(front+30.0, front, d)*smoothstep(0.0,8.0,d);
          vec2 dir = (vW.xz-r.xy)/max(d,1.0);
          n.xz += dir*wave*2.2*r.z;
        }
        n = normalize(n);
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.04 + 0.96*pow(1.0-max(dot(n,V),0.0), 5.0);
        vec3 R = reflect(-V, n);
        vec3 sky = mix(uHorizon, uSky, clamp(R.y*1.4,0.0,1.0));
        vec3 L = normalize(uSun);
        float s = max(dot(R,L),0.0);
        float spec = pow(s,400.0)*8.0 + pow(s,60.0)*0.5;
        float deepT = smoothstep(1.0, 0.25, vR);
        vec3 body = mix(vec3(0.30,0.36,0.24), vec3(0.02,0.10,0.13), deepT);
        // fake subsurface scatter toward the sun
        body += vec3(0.05,0.12,0.10)*pow(max(dot(-V,L)*0.5+0.5,0.0),3.0)*(1.0-deepT);
        vec3 col = mix(body, sky, fres) + spec*vec3(1.0,0.95,0.82);
        float foamN = texture2D(uNormal, p*4.0 + uTime*0.03).x;
        float foam = smoothstep(0.86,1.0,vR) * (0.55+0.45*sin(vR*70.0 - uTime*2.2 + foamN*8.0));
        col = mix(col, vec3(0.93,0.95,0.94), foam*0.6);
        float alpha = mix(0.93, 0.45, smoothstep(0.7,1.0,vR));
        alpha = max(alpha, min(fres*1.2,1.0));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
})();

// Irregular water body; aR = 0 at center, 1 at the shoreline
export function waterGeometry(radius, seed = 1, seg = 64, rings = 10) {
  const pos = [], aR = [], idx = [];
  pos.push(0, 0, 0); aR.push(0);
  const edge = (a) => radius * (0.78 + 0.35 * fbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2 + seed * 3, 3));
  for (let k = 1; k <= rings; k++) {
    const t = k / rings;
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2, r = edge(a) * t;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); aR.push(t);
    }
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + (i + 1) % seg, 1 + i);
  for (let k = 1; k < rings; k++) {
    const a0 = 1 + (k - 1) * seg, b0 = 1 + k * seg;
    for (let i = 0; i < seg; i++) {
      const i1 = (i + 1) % seg;
      idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(aR, 1));
  g.setIndex(idx);
  return g;
}
export function waterMesh(radius, seed) {
  const m = new THREE.Mesh(waterGeometry(radius, seed), waterMat);
  m.renderOrder = 2;
  return m;
}
export function addRipple(x, z, strength = 1) {
  const r = ripples[rippleIdx++ % ripples.length];
  r.set(x, z, strength, waterMat.uniforms.uTime.value);
}
export function updateWater(t, sunDir) {
  waterMat.uniforms.uTime.value = t;
  waterMat.uniforms.uSun.value.copy(sunDir);
}
