let raf = null;

export function startWebGLDemo(canvas, statusEl) {
  stopWebGLDemo();
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) { statusEl.textContent = "WebGL 不支援"; return; }

  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, `
    attribute vec2 p; uniform float a;
    void main(){
      float c=cos(a), s=sin(a);
      gl_Position=vec4(c*p.x-s*p.y,s*p.x+c*p.y,0.,1.);
    }`);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, "precision mediump float; void main(){gl_FragColor=vec4(.55,.72,1.,1.);}");
  gl.compileShader(fs);

  const prog=gl.createProgram();
  gl.attachShader(prog,vs); gl.attachShader(prog,fs); gl.linkProgram(prog);
  const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,.65,-.55,-.45,.55,-.45]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(prog,"p"), angle=gl.getUniformLocation(prog,"a");
  gl.useProgram(prog); gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);

  const start=performance.now(); let frames=0; let last=start;
  const draw=(now)=>{
    frames++;
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clearColor(.03,.05,.08,1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(angle,(now-start)/800); gl.drawArrays(gl.TRIANGLES,0,3);
    if(now-last>1000){ statusEl.textContent=`WebGL 執行中｜約 ${frames} FPS｜WebGPU：${navigator.gpu?"支援":"不支援"}`; frames=0; last=now; }
    raf=requestAnimationFrame(draw);
  };
  raf=requestAnimationFrame(draw);
}

export function stopWebGLDemo(){ if(raf) cancelAnimationFrame(raf); raf=null; }
