/* Local, real-time video transcoding. Never requests camera or microphone access. */
(function(root){
 'use strict';
 const MiB=1024*1024,MAX_INPUT=250*MiB,MAX_OUTPUT=10*MiB,TARGET=8*MiB,MAX_SECONDS=180;
 function mimeFor(file){const type=(file.type||'').split(';')[0];return ['video/mp4','video/quicktime','video/webm'].includes(type)?type:({mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'})[(file.name||'').split('.').pop().toLowerCase()]}
 function plan(duration,width,height){
  if(!Number.isFinite(duration)||duration<=0||duration>MAX_SECONDS)throw Error('Elegí un video de hasta 3 minutos. La compresión reduce el peso, no recorta la receta.');
  if(!width||!height)throw Error('No pudimos leer la imagen del video. Probá exportarlo como MP4.');
  const videoBitsPerSecond=Math.max(180000,Math.min(1800000,Math.floor(TARGET*8*.78/duration)-64000));
  const edge=videoBitsPerSecond<500000?640:960,scale=Math.min(1,edge/Math.max(width,height));
  return {width:Math.max(2,Math.floor(width*scale/2)*2),height:Math.max(2,Math.floor(height*scale/2)*2),videoBitsPerSecond,audioBitsPerSecond:64000};
 }
 function recorderMime(){if(!root.MediaRecorder?.isTypeSupported)return null;return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(t=>root.MediaRecorder.isTypeSupported(t))||null}
 function aborted(){return new DOMException('Compresión cancelada. No se subió el video.','AbortError')}
 async function prepare(file,{signal,onProgress=()=>{},previewHost}={}){
  if(!file?.size)throw Error('Elegí un video.');if(file.size>MAX_INPUT)throw Error('Elegí un video de hasta 250 MB.');
  const originalMime=mimeFor(file);if(!originalMime)throw Error('Usá un archivo MP4, MOV o WebM.');if(signal?.aborted)throw aborted();
  const needsCompression=file.size>TARGET;
  const video=document.createElement('video');video.playsInline=true;video.setAttribute('playsinline','');video.preload='auto';video.controls=false;video.disablePictureInPicture=true;video.className='compression-preview';video.setAttribute('aria-label','Vista previa del video que se está comprimiendo');
  const canvas=document.createElement('canvas'),mime=recorderMime(),Audio=root.AudioContext||root.webkitAudioContext;
  let audio,source,destination,stream,recorder,frame,watchdog,wakeLock,url,settled=false;
  let audioReady;
  // Resume in the submit gesture, before waiting for file metadata (important on iPhone).
  if(needsCompression&&mime&&Audio&&canvas.captureStream){try{audio=new Audio();audioReady=audio.resume().then(()=>true,()=>false)}catch{}}
  try{
   url=URL.createObjectURL(file);previewHost?.append(video);
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(Error('No pudimos abrir el video. Probá exportarlo como MP4 compatible.')),20000);
    function finish(error){clearTimeout(timer);video.onloadeddata=null;video.onerror=null;signal?.removeEventListener('abort',cancel);error?reject(error):resolve()}
    const cancel=()=>finish(aborted());signal?.addEventListener('abort',cancel,{once:true});video.onloadeddata=()=>finish();video.onerror=()=>finish(Error('Este navegador no puede leer el video. Probá exportarlo como MP4.'));video.src=url;
   });
   if(signal?.aborted)throw aborted();
   const duration=video.duration,settings=plan(duration,video.videoWidth,video.videoHeight);
   if(!needsCompression||((!mime||!audio||!canvas.captureStream)&&file.size<=MAX_OUTPUT)){onProgress({percent:100,phase:'ready'});return {file,mime:originalMime,duration,compressed:false,originalSize:file.size}}
   if(!mime||!audio||!canvas.captureStream)throw Error('Este navegador no permite comprimir este video. Probá abrir Chefcito en Safari o Chrome actualizado, o elegí un archivo de hasta 8 MB.');
   await audioReady;if(audio.state!=='running')throw Error('No pudimos activar el audio del video. Tocá Analizar receta nuevamente.');
   canvas.width=settings.width;canvas.height=settings.height;const context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('No se pudo preparar la imagen del video.');
   context.drawImage(video,0,0,canvas.width,canvas.height);stream=canvas.captureStream(24);
   source=audio.createMediaElementSource(video);destination=audio.createMediaStreamDestination();source.connect(destination);
   for(const track of destination.stream.getAudioTracks())stream.addTrack(track);
   // Audio flows to the recording, not the speakers. No microphone is used.
   recorder=new root.MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:settings.videoBitsPerSecond,audioBitsPerSecond:settings.audioBitsPerSecond});
   try{wakeLock=await navigator.wakeLock?.request('screen')}catch{}
   if(signal?.aborted)throw aborted();if(document.hidden)throw Error('Mantené Chefcito visible mientras se comprime el video.');
   const blob=await new Promise((resolve,reject)=>{
    const chunks=[];let bytes=0,lastTime=0,lastAdvance=Date.now(),ended=false;
    const cleanup=()=>{signal?.removeEventListener('abort',cancel);document.removeEventListener('visibilitychange',visibility);clearInterval(watchdog);cancelAnimationFrame(frame);video.onended=null;video.onerror=null};
    function fail(error){if(settled)return;settled=true;cleanup();if(recorder.state!=='inactive')recorder.stop();reject(error)}
    const cancel=()=>fail(aborted()),visibility=()=>{if(document.hidden)fail(Error('La compresión se interrumpió al salir de la app. Volvé a intentarlo dejando Chefcito abierto.'))};
    signal?.addEventListener('abort',cancel,{once:true});document.addEventListener('visibilitychange',visibility);
    recorder.ondataavailable=e=>{if(settled)return;if(e.data.size){bytes+=e.data.size;if(bytes>MAX_OUTPUT){fail(Error('El navegador no logró reducirlo a 10 MB. Probá recortar el video o exportarlo en menor resolución.'));return}chunks.push(e.data)}};
    recorder.onerror=()=>fail(Error('No se pudo comprimir el video en este dispositivo. Probá con otro MP4.'));
    recorder.onstop=()=>{if(settled)return;settled=true;cleanup();if(!ended){reject(Error('El video no terminó de comprimirse. No se subió un archivo incompleto.'));return}const result=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});if(!result.size){reject(Error('La compresión produjo un archivo vacío.'));return}onProgress({percent:100,phase:'ready'});resolve(result)};
    video.onended=()=>{ended=true;recorder.stop()};video.onerror=()=>fail(Error('No pudimos decodificar el video completo. Probá exportarlo como MP4.'));
    function draw(){if(settled)return;try{context.drawImage(video,0,0,canvas.width,canvas.height);onProgress({percent:Math.min(99,Math.floor(video.currentTime/duration*100)),phase:'compressing',seconds:Math.max(0,Math.ceil(duration-video.currentTime))});frame=requestAnimationFrame(draw)}catch(e){fail(e)}}
    watchdog=setInterval(()=>{if(video.currentTime>lastTime+.01){lastTime=video.currentTime;lastAdvance=Date.now()}else if(Date.now()-lastAdvance>15000)fail(Error('El video dejó de avanzar. Volvé a intentarlo manteniendo la pantalla encendida.'));if(audio.state!=='running')fail(Error('Se interrumpió el audio. Volvé a comprimir el video con Chefcito abierto.'))},1000);
    recorder.start(1000);draw();video.play().catch(()=>fail(Error('El navegador bloqueó la reproducción. Tocá Analizar receta nuevamente.')));
   });
   if(signal?.aborted)throw aborted();if(blob.size>MAX_OUTPUT)throw Error('El video comprimido todavía supera los 10 MB.');
   // A small source can occasionally grow when re-encoded. Send the smaller allowed file.
   if(file.size<=MAX_OUTPUT&&file.size<=blob.size)return {file,mime:originalMime,duration,compressed:false,originalSize:file.size};
   const type=blob.type.split(';')[0],output=new File([blob],'chefcito-comprimido.'+(type==='video/mp4'?'mp4':'webm'),{type});
   return {file:output,mime:type,duration,compressed:true,originalSize:file.size};
  }finally{
   settled=true;clearInterval(watchdog);cancelAnimationFrame(frame);if(recorder?.state&&recorder.state!=='inactive')recorder.stop();
   video.pause();source?.disconnect();stream?.getTracks().forEach(t=>t.stop());destination?.stream.getTracks().forEach(t=>t.stop());
   if(audio&&audio.state!=='closed')await audio.close().catch(()=>{});await wakeLock?.release().catch(()=>{});
   video.removeAttribute('src');video.load();video.remove();if(url)URL.revokeObjectURL(url);
  }
 }
 root.ChefVideoCompression={prepare,plan,mimeFor,recorderMime,MAX_INPUT,MAX_OUTPUT,TARGET,MAX_SECONDS};
})(window);
