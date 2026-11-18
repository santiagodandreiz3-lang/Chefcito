/* SPA navigation and profile. Private data remains behind the existing Supabase RLS. */
const routeNames={inicio:'Inicio',buscar:'Buscar',agregar:'Agregar',recetario:'Recetario','mis-platos':'Mis platos'};
const navRoutes={home:'inicio',find:'buscar',add:'agregar',fav:'recetario',albumNav:'mis-platos'};
let route='inicio',routeEpoch=0;
const main=document.querySelector('main');
const hero=main.querySelector('.hero'),banner=main.querySelector('.banner');
const routeHeading=document.createElement('section');routeHeading.className='route-heading';routeHeading.innerHTML='<div><div class="tiny">LA COCINA DE CHEFCITO</div><h1 id="routeTitle" tabindex="-1"></h1></div><button class="back-home" id="backHome">← Inicio</button>';main.prepend(routeHeading);
const addPanel=document.createElement('section');addPanel.className='add-page';addPanel.id='addPage';addPanel.innerHTML='<div class="checkered" aria-hidden="true"></div><div class="tiny">DEL VIDEO A TU MESA</div><h2>Una nueva receta empieza acá.</h2><p>Subí un video de cocina para extraer ingredientes, pasos y puntos clave. O escribí tu receta de siempre.</p><button class="primary" id="uploadVideo">Analizar un video</button><button class="secondary" id="writeRecipe">Escribir una receta</button><button class="secondary" id="previousVideos">Ver análisis recientes</button><p class="note">MP4, MOV o WebM · hasta 250 MB y 3 minutos. Compresión automática antes del análisis. Revisá el resultado antes de guardarlo.</p>';main.append(addPanel);
$('uploadVideo').onclick=()=>addRecipeMenu();$('writeRecipe').onclick=()=>recipeForm();$('previousVideos').onclick=()=>{if(requireAccount())recentVideoDrafts()};
function navigate(next){if(!routeNames[next])next='inicio';const hash='#/'+next;if(location.hash===hash)applyRoute(true);else location.hash=hash}
function routeVisibility(){
 const listing=['inicio','buscar','recetario'].includes(route);
 hero.hidden=route!=='inicio';banner.hidden=route!=='inicio';routeHeading.hidden=route==='inicio';
 $('search').hidden=route!=='buscar';$('cats').hidden=!['inicio','buscar'].includes(route);
 $('grid').hidden=!listing;main.querySelector('.heading').hidden=!listing;
 gallery.hidden=route!=='mis-platos';addPanel.hidden=route!=='agregar';
 $('routeTitle').textContent=routeNames[route];document.title='Chefcito · '+routeNames[route];
 for(const [id,r] of Object.entries(navRoutes)){if(r===route)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current')}
}
async function loadGallery(){
 if(route!=='mis-platos')return;
 if(!currentUser){gallery.innerHTML='<div class="album-intro"><h2>Tus recuerdos en la cocina</h2><p>Ingresá para guardar y ver tus fotos de platos cocinados.</p><button class="primary" id="albumLogin">Ingresar a mi cuenta</button></div>';$('albumLogin').onclick=()=>accountForm();return}
 if(!cloudReady){gallery.innerHTML='<p class="empty">Estamos preparando tu álbum…</p>';return}
 await openAlbum();routeVisibility();
}
function applyRoute(focus=false){
 const next=location.hash.replace(/^#\/?/,'');route=routeNames[next]?next:'inicio';routeEpoch++;
 onlyFav=route==='recetario';category='Todas';$('search').value='';cats();routeVisibility();render();
 if(route==='mis-platos')loadGallery();
 if(focus){$('dialog').close();window.scrollTo({top:0,behavior:'auto'});if(route==='buscar')$('search').focus();else if(route!=='inicio')$('routeTitle').focus();else hero.querySelector('h1').focus()}
}
hero.querySelector('h1').tabIndex=-1;
// The original album renderer calls setPage. Keep route state authoritative.
setPage=function(album){if(album&&route!=='mis-platos'){navigate('mis-platos');return}routeVisibility()};
go=function(f){navigate(f?'recetario':'inicio')};
for(const [id,r] of Object.entries(navRoutes))$(id).onclick=()=>navigate(r);
$('backHome').onclick=()=>navigate('inicio');$('topFav').onclick=()=>navigate('recetario');
window.addEventListener('hashchange',()=>applyRoute(true));
const baseRender=render;
render=function(){baseRender();if(typeof route==='string')routeVisibility();document.querySelectorAll('#grid img').forEach(img=>{img.onerror=()=>{img.onerror=null;img.src='assets/recipe-placeholder.svg';img.alt='Fotografía no disponible'}});document.querySelectorAll('#grid .card').forEach((card,i)=>{const matching=recipes.filter(r=>(!onlyFav||r.owned||saved.includes(r.id))&&(category==='Todas'||r.cat===category||r.tags.includes(category))&&norm(r.name+' '+r.ingredients.join(' ')).includes(norm($('search').value)))[i];if(matching?.servings)card.querySelector('.time').textContent=`◷ ${matching.time} min${matching.rest?' · incluye reposo':''} · ${matching.servings}`})};
const richRecipeBase=openRecipe;
openRecipe=function(r){richRecipeBase(r);const content=$('detail').querySelector('.content'),note=content.querySelector('.note');
 if(!r.owned){note.textContent='Receta adaptada para cocinar en casa. Tiempos aproximados.';const facts=document.createElement('div');facts.className='recipe-facts';facts.innerHTML=[['Preparación',r.prep+' min'],['Cocción',r.cook?r.cook+' min':'Sin cocción'],['Reposo / frío',r.rest?'Al menos '+r.rest+' min':'No requiere'],['Rinde',r.servings],['Temperatura',r.temperature],['Tiempo total',r.time+' min'+(r.rest?' o más':'')]].map(([k,v])=>`<div><small>${escapeText(k)}</small>${escapeText(v)}</div>`).join('');note.after(facts);
 const extra=document.createElement('div');extra.className='recipe-extra';extra.innerHTML=`<h3>Consejos de Chefcito</h3><ul>${(r.tips||[]).map(t=>`<li>${escapeText(t)}</li>`).join('')}</ul><h3>Posibles sustituciones</h3><ul>${(r.substitutions||[]).map(t=>`<li>${escapeText(t)}</li>`).join('')}</ul><p class="recipe-source">${escapeText(r.adaptation)} <a href="${escapeText(r.source)}" target="_blank" rel="noopener noreferrer">Ver receta original en Good Food ↗</a></p><p class="photo-credit">${escapeText(r.credit)}. Los consejos y sustituciones son de esta adaptación.</p>`;$('cook').before(extra);
 }else{note.textContent=(r.time==null?'Tiempo no especificado':r.time+' minutos')+' · Receta de tu cuenta';}
 const img=$('detail').querySelector('img');if(img)img.onerror=()=>{img.onerror=null;img.src='assets/recipe-placeholder.svg';img.alt='Fotografía no disponible'};
};
// Avatar only in the header, with a keyboard-accessible disclosure menu.
const accountMenu=document.createElement('div');accountMenu.id='accountMenu';accountMenu.className='account-popover';accountMenu.hidden=true;document.querySelector('header').append(accountMenu);
accountButton.setAttribute('aria-label','Abrir menú de cuenta');accountButton.setAttribute('aria-expanded','false');accountButton.setAttribute('aria-controls','accountMenu');
let avatarObjectURL=null,avatarGeneration=0;
function closeAccountMenu(focus=false){accountMenu.hidden=true;accountButton.setAttribute('aria-expanded','false');if(focus)accountButton.focus()}
function defaultAvatar(){accountButton.innerHTML='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="10" r="6" fill="currentColor"/><path d="M4 30v-3a12 12 0 0 1 24 0v3" fill="currentColor"/></svg>'}
async function updateAvatar(){const generation=++avatarGeneration;if(avatarObjectURL){URL.revokeObjectURL(avatarObjectURL);avatarObjectURL=null}defaultAvatar();accountButton.setAttribute('aria-label',currentUser?'Abrir menú de '+(currentUser.user_metadata?.display_name||'mi cuenta'):'Ingresar a Chefcito');const path=currentUser?.user_metadata?.avatar_path;if(!path||!path.startsWith(currentUser.id+'/'))return;try{const {data,error}=await cloud.storage.from('chef-photos').download(path);if(error||generation!==avatarGeneration)return;avatarObjectURL=URL.createObjectURL(data);const img=document.createElement('img');img.src=avatarObjectURL;img.alt='Mi foto de perfil';accountButton.replaceChildren(img)}catch{/* Keep a usable avatar when offline. */}}
function showAccountMenu(){
 accountMenu.replaceChildren();const title=document.createElement('p');title.textContent=currentUser?.user_metadata?.display_name||currentUser?.email||'Tu rincón en Chefcito';accountMenu.append(title);
 const actions=currentUser?[['Editar perfil',()=>profileForm()],['Configuración de la cuenta',()=>settingsForm()],['Cerrar sesión',async()=>{try{const {error}=await cloud.auth.signOut();if(error)throw error;await syncAccount(null);navigate('inicio')}catch(e){cloudMessage(errorText(e))}}]]:[['Ingresar',()=>accountForm()],['Crear cuenta',()=>accountForm('signup')]];
 for(const [label,action] of actions){const b=document.createElement('button');b.textContent=label;if(label==='Cerrar sesión')b.className='danger';b.onclick=()=>{closeAccountMenu();action()};accountMenu.append(b)}accountMenu.hidden=false;accountButton.setAttribute('aria-expanded','true');accountMenu.querySelector('button').focus();
}
accountButton.onclick=()=>accountMenu.hidden?showAccountMenu():closeAccountMenu(true);
document.addEventListener('click',e=>{if(!accountMenu.contains(e.target)&&!accountButton.contains(e.target))closeAccountMenu()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!accountMenu.hidden)closeAccountMenu(true)});
accountMenu.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...accountMenu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus()});
async function avatarBlob(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Elegí una foto JPG, PNG o WebP.');if(file.size>10*1024*1024)throw Error('La foto debe pesar menos de 10 MB.');const bitmap=await createImageBitmap(file);try{const side=Math.min(bitmap.width,bitmap.height),canvas=document.createElement('canvas');canvas.width=canvas.height=512;canvas.getContext('2d').drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,512,512);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));if(!blob)throw Error('No pudimos preparar esa foto.');return blob}finally{bitmap.close()}}
function profileForm(){if(!requireAccount())return;const userId=currentUser.id;const oldPath=currentUser.user_metadata?.avatar_path;
 $('detail').innerHTML=`<div class="content cloud-form" style="padding-top:60px"><div class="tiny">A TU GUSTO</div><h2>Editar perfil</h2><img class="profile-preview" id="profilePreview" alt="Vista previa de tu foto"><form id="profileForm"><label>Tu nombre<input name="display_name" maxlength="60" autocomplete="nickname" required></label><label>Foto de perfil<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="note">JPG, PNG o WebP · hasta 10 MB. Se recorta al centro.</p><button class="primary" type="submit">Guardar cambios</button><p id="profileStatus" role="status"></p></form></div>`;
 const form=$('profileForm');form.elements.display_name.value=currentUser.user_metadata?.display_name||'';if(avatarObjectURL)$('profilePreview').src=avatarObjectURL;let selectedBlob=null,previewURL=null,processing=false,selectionVersion=0;
 function cleanup(){if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null}}$('dialog').addEventListener('close',cleanup,{once:true});
 form.elements.avatar.onchange=async()=>{const version=++selectionVersion;selectedBlob=null;const file=form.elements.avatar.files[0];if(!file){processing=false;return}processing=true;form.querySelector('button').disabled=true;$('profileStatus').textContent='Preparando foto…';try{const blob=await avatarBlob(file);if(version!==selectionVersion)return;selectedBlob=blob;cleanup();previewURL=URL.createObjectURL(blob);$('profilePreview').src=previewURL;$('profileStatus').textContent='Foto lista.'}catch(e){if(version===selectionVersion)$('profileStatus').textContent=errorText(e)}finally{if(version===selectionVersion){processing=false;form.querySelector('button').disabled=false}}};
 form.onsubmit=async e=>{e.preventDefault();if(processing||currentUser?.id!==userId)return;const button=form.querySelector('button'),status=$('profileStatus');button.disabled=true;status.textContent='Guardando…';let newPath=null;try{const name=form.elements.display_name.value.trim();if(!name)throw Error('Escribí tu nombre.');if(selectedBlob){newPath=userId+'/avatar-'+crypto.randomUUID()+'.jpg';const upload=await cloud.storage.from('chef-photos').upload(newPath,selectedBlob,{contentType:'image/jpeg',upsert:false});if(upload.error)throw upload.error}if(currentUser?.id!==userId)throw Error('Tu sesión cambió. Volvé a ingresar.');const metadata={display_name:name,...(newPath?{avatar_path:newPath}:{})};const {data,error}=await cloud.auth.updateUser({data:metadata});if(error)throw error;currentUser=data.user;await updateAvatar();if(newPath&&oldPath&&oldPath.startsWith(userId+'/avatar-'))await cloud.storage.from('chef-photos').remove([oldPath]).catch(()=>{});cleanup();$('dialog').close();cloudMessage('Perfil actualizado.')}catch(error){if(newPath)await cloud.storage.from('chef-photos').remove([newPath]);status.textContent=errorText(error)}finally{button.disabled=false}};show();
}
function settingsForm(){if(!currentUser){accountForm();return}$('detail').innerHTML=`<div class="content cloud-form" style="padding-top:60px"><div class="tiny">TU CUENTA</div><h2>Configuración</h2><p>${escapeText(currentUser.email)}</p><button class="primary" id="changePassword">Cambiar contraseña</button><button class="secondary" id="refreshAccount">Sincronizar recetas y fotos</button><label class="profile-row"><input id="animationSetting" type="checkbox"> Animaciones de Chefcito</label><p class="note">También respetamos la preferencia de reducir movimiento de tu dispositivo.</p><p id="settingsStatus" role="status"></p></div>`;$('changePassword').onclick=()=>accountForm('password');$('refreshAccount').onclick=async()=>{await syncAccount(currentUser);if($('settingsStatus'))$('settingsStatus').textContent=cloudReady?'Tus datos están actualizados.':'No pudimos sincronizar. Revisá tu conexión.'};$('animationSetting').checked=animationsEnabled;$('animationSetting').onchange=e=>{animationsEnabled=e.target.checked;try{localStorage.setItem('chef-animations',String(animationsEnabled))}catch{}scheduleMascot(false)};show()}
const syncBase=syncAccount;
syncAccount=async function(user){closeAccountMenu();const result=syncBase(user);updateAvatar();await result;updateAvatar();routeVisibility();if(route==='mis-platos')loadGallery()};
// A short greeting on entry, followed by a gentle wave and wink every five seconds.
const mascot=$('chefcitoMascot'),motionPreference=matchMedia('(prefers-reduced-motion: reduce)');let greetingTimer=null,greetingEnd=null,animationsEnabled=true;
try{animationsEnabled=localStorage.getItem('chef-animations')!=='false'}catch{}
function greet(){if(document.hidden||motionPreference.matches||!animationsEnabled)return;mascot.classList.remove('is-greeting');void mascot.getBoundingClientRect();mascot.classList.add('is-greeting');clearTimeout(greetingEnd);greetingEnd=setTimeout(()=>mascot.classList.remove('is-greeting'),1700)}
function scheduleMascot(welcome=false){clearInterval(greetingTimer);clearTimeout(greetingEnd);mascot.classList.remove('is-greeting');if(document.hidden||motionPreference.matches||!animationsEnabled)return;if(welcome){greet();const hello=document.createElement('div');hello.className='welcome-note';hello.textContent='¡Benvenuto a Chefcito!';hello.setAttribute('role','status');document.body.append(hello);setTimeout(()=>hello.remove(),2400)}greetingTimer=setInterval(greet,5000)}
document.addEventListener('visibilitychange',()=>scheduleMascot(false));motionPreference.addEventListener('change',()=>scheduleMascot(false));
window.addEventListener('offline',()=>cloudMessage('Estás sin conexión. Para guardar recetas, fotos o analizar videos necesitás internet.'));window.addEventListener('online',()=>{if(currentUser)syncAccount(currentUser);else cloudMessage('')});
defaultAvatar();applyRoute();scheduleMascot(true);
