(() => {
"use strict";
const $ = (s,root=document) => root.querySelector(s);
const $$ = (s,root=document) => [...root.querySelectorAll(s)];
 // Keep the age gate interactive even if a later app initializer fails.
 document.addEventListener("click", event => {
   const yes = event.target.closest("#ageYes");
   const no = event.target.closest("#ageNo");
   if (!yes && !no) return;
   event.preventDefault();
   event.stopImmediatePropagation();
   const gate = document.getElementById("ageGate");
   if (yes) {
     try { sessionStorage.setItem("asm_age_confirmed", "yes"); } catch (_) {}
     gate?.classList.add("hidden");
   } else {
     document.body.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;text-align:center;padding:30px;background:#09090d;color:#fff;font-family:Arial,sans-serif"><div><h1>Akses tidak tersedia</h1><p>Website ini hanya dapat diakses oleh pengunjung berusia 18 tahun ke atas.</p></div></main>';
   }
 }, true);
const cfg = window.APP_CONFIG || {};
const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
const db = configured ? window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY) : null;
const state = {user:null,profile:null,videos:[],filter:"all",view:"home",saved:new Set(JSON.parse(localStorage.getItem("asm_saved")||"[]")),page:1,search:""};
const money = n => new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n||0);
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toast = msg => {const el=document.createElement("div");el.className="toast";el.textContent=msg;$("#toastRegion").append(el);setTimeout(()=>el.remove(),3200)};
const modal = html => {$("#modalContent").innerHTML=html;$("#modalBackdrop").classList.remove("hidden")};
const closeModal = () => {$("#modalBackdrop").classList.add("hidden");$("#modalBackdrop").classList.remove("player-mode");$("#mainModal").classList.remove("player-modal")};
const demoVideos = [
 {id:"demo1",title:"Contoh video pilihan hari ini",description:"Video demo untuk memperlihatkan tampilan katalog.",thumbnail:"",duration:"08:24",views:12400,created_at:new Date().toISOString(),is_exclusive:false,video_url:""},
 {id:"demo2",title:"Koleksi eksklusif — preview",description:"Preview katalog premium. Tambahkan video milikmu melalui database.",thumbnail:"",duration:"12:10",views:8900,created_at:new Date(Date.now()-86400000).toISOString(),is_exclusive:true,video_url:""},
 {id:"demo3",title:"Rekomendasi komunitas",description:"Contoh kartu video ASUPANMEME.",thumbnail:"",duration:"06:42",views:7300,created_at:new Date(Date.now()-172800000).toISOString(),is_exclusive:false,video_url:""},
 {id:"demo4",title:"Premium selection",description:"Konten khusus anggota aktif.",thumbnail:"",duration:"15:02",views:6200,created_at:new Date(Date.now()-259200000).toISOString(),is_exclusive:true,video_url:""}
];
function openAccount(){if(state.user){accountPanel();return}modal(`<p class="eyebrow">WELCOME BACK</p><h2 id="modalTitle">Masuk ke akun</h2><p>Masuk menggunakan email dan password yang terdaftar. Akun admin dan pengguna menggunakan halaman login yang sama.</p><form class="form-stack" id="authForm"><div class="field"><label>Email</label><input name="email" type="email" required placeholder="nama@email.com"></div><div class="field"><label>Password</label><input name="password" type="password" minlength="6" required placeholder="Minimal 6 karakter"></div><button class="btn btn-primary" type="submit">Masuk</button></form><p class="form-foot">Belum punya akun? <button class="inline-link" id="showSignup">Daftar sekarang</button></p>`);$("#authForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(!db){toast("Hubungkan Supabase terlebih dahulu untuk mengaktifkan akun.");return}const {data,error}=await db.auth.signInWithPassword({email:f.get("email"),password:f.get("password")});if(error){toast("Email atau password salah. Periksa kembali data login kamu.");return}state.user=data.user;await loadProfile();closeModal();refreshAuth();toast("Berhasil login.")};$("#showSignup").onclick=signupPanel}
function signupPanel(){modal(`<p class="eyebrow">JOIN THE COMMUNITY</p><h2 id="modalTitle">Buat akun baru</h2><p>Gunakan email aktif untuk membuat akun.</p><form class="form-stack" id="signupForm"><div class="field"><label>Nama tampilan</label><input name="name" required maxlength="60" placeholder="Nama kamu"></div><div class="field"><label>Email</label><input name="email" type="email" required placeholder="nama@email.com"></div><div class="field"><label>Password</label><input name="password" type="password" minlength="8" required placeholder="Minimal 8 karakter"></div><button class="btn btn-primary">Daftar</button></form><p class="form-foot">Sudah punya akun? <button class="inline-link" id="showLogin">Masuk</button></p>`);$("#signupForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(!db){toast("Hubungkan Supabase terlebih dahulu untuk mengaktifkan akun.");return}const {data,error}=await db.auth.signUp({email:f.get("email"),password:f.get("password"),options:{data:{display_name:f.get("name")}}});if(error){toast(error.message);return}if(data.user){toast("Pendaftaran berhasil. Periksa email untuk verifikasi jika diminta.");closeModal()}};$("#showLogin").onclick=openAccount}
async function loadProfile(){if(!db||!state.user)return;const {data}=await db.from("profiles").select("*").eq("id",state.user.id).maybeSingle();state.profile=data||null}
function accountPanel(){modal(`<p class="eyebrow">MY ACCOUNT</p><h2 id="modalTitle">${esc(state.profile?.display_name||state.user.email)}</h2><p>${esc(state.user.email)}</p><p>Membership: <span class="status-pill ${state.profile?.subscription_status==="active"?"approved":""}">${esc(state.profile?.subscription_status||"free").toUpperCase()}</span></p><div class="form-stack"><button class="btn btn-primary" id="uploadOpen">Upload video</button><button class="btn btn-ghost" id="myMembership">Kelola membership</button>${state.profile?.role==="admin"?'<button class="btn btn-ghost" id="adminOpen">Dashboard admin</button>':""}<button class="btn btn-ghost" id="logoutBtn">Keluar</button></div>`);$("#uploadOpen").onclick=uploadPanel;$("#myMembership").onclick=membershipPanel;if($("#adminOpen"))$("#adminOpen").onclick=adminPanel;$("#logoutBtn").onclick=async()=>{await db?.auth.signOut();state.user=null;state.profile=null;closeModal();refreshAuth();toast("Kamu sudah keluar.")}}
function refreshAuth(){$("#accountButton").textContent=state.user?(state.profile?.display_name||state.user.email||"U").slice(0,1).toUpperCase():"?";renderVideos()}
async function loadVideos(){if(!db){state.videos=demoVideos;renderVideos();return}const {data,error}=await db.from("videos").select("id,title,description,thumbnail_url,duration,views,created_at,is_exclusive,video_url,storage_path").eq("published",true).order("created_at",{ascending:false});if(error){toast("Tidak dapat memuat katalog: "+error.message);state.videos=demoVideos}else state.videos=data||[];renderVideos()}
function hasPremium(){if(state.profile?.role==="admin")return true;return state.profile?.subscription_status==="active" && (!state.profile?.subscription_expires_at || new Date(state.profile.subscription_expires_at)>new Date())}
function card(v){const locked=v.is_exclusive&&!hasPremium();const longTitle=String(v.title||"").length>52;return `<article class="video-card" data-video="${esc(v.id)}"><div class="thumb">${v.thumbnail_url?'<img loading="lazy" src="'+esc(v.thumbnail_url)+'" alt="">':'<div class="thumb-placeholder">A.</div>'}${v.is_exclusive?'<span class="exclusive-tag">✦ EKSKLUSIF</span>':""}<span class="duration">${esc(v.duration||"VIDEO")}</span><button class="save-btn" data-save="${esc(v.id)}" aria-label="Simpan video">${state.saved.has(v.id)?"♥":"♡"}</button>${locked?'<span class="exclusive-tag" style="top:auto;bottom:9px">🔒 MEMBER</span>':""}</div><div class="video-info"><h3 class="video-title${longTitle?" is-clamped":""}">${esc(v.title)}</h3>${longTitle?'<button class="title-more" type="button" data-title-toggle aria-expanded="false">Baca selengkapnya</button>':""}<p>${Number(v.views||0).toLocaleString("id-ID")} views · ${new Date(v.created_at).toLocaleDateString("id-ID")}</p></div></article>`}
function renderVideos(){
 let list=[...state.videos];
 if(state.view==="popular")list.sort((a,b)=>(b.views||0)-(a.views||0));
 if(state.view==="latest")list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 if(state.view==="exclusive")list=list.filter(v=>v.is_exclusive);
 if(state.view==="saved")list=list.filter(v=>state.saved.has(v.id));
 if(state.filter==="free")list=list.filter(v=>!v.is_exclusive);
 if(state.filter==="exclusive")list=list.filter(v=>v.is_exclusive);
 if(state.search)list=list.filter(v=>(v.title+" "+(v.description||"")).toLowerCase().includes(state.search));
 const popular=[...state.videos].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,4);
 $("#popularGrid").innerHTML=popular.map(card).join("")||'<div class="loading-card">Belum ada video.</div>';
 const pageSize=8,totalPages=Math.max(1,Math.ceil(list.length/pageSize));
 state.page=Math.min(Math.max(1,state.page),totalPages);
 const start=(state.page-1)*pageSize;
 const pageItems=list.slice(start,start+pageSize);
 $("#videoGrid").innerHTML=pageItems.map(card).join("");
 $("#videoCount").textContent=list.length+" video tersedia";
 $("#emptyState").classList.toggle("hidden",list.length>0);
 const pagination=$("#pagination");
 if(totalPages>1){
  const pages=Array.from({length:totalPages},(_,i)=>i+1);
  pagination.innerHTML='<button class="page-btn" data-page="'+(state.page-1)+'" '+(state.page===1?'disabled':'')+'>‹ Sebelumnya</button>'+pages.map(n=>'<button class="page-btn '+(n===state.page?'active':'')+'" data-page="'+n+'" aria-label="Halaman '+n+'" '+(n===state.page?'aria-current="page"':'')+'>'+n+'</button>').join("")+'<button class="page-btn" data-page="'+(state.page+1)+'" '+(state.page===totalPages?'disabled':'')+'>Berikutnya ›</button>';
 }else pagination.innerHTML="";
 $$(".video-card").forEach(el=>el.onclick=e=>{if(e.target.closest("[data-save]"))return;openVideo(el.dataset.video)});
 $$("[data-save]").forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.save;state.saved.has(id)?state.saved.delete(id):state.saved.add(id);localStorage.setItem("asm_saved",JSON.stringify([...state.saved]));renderVideos()});
 $$("[data-title-toggle]").forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();const title=b.parentElement.querySelector(".video-title");const expanded=b.getAttribute("aria-expanded")==="true";title.classList.toggle("is-clamped",expanded);b.setAttribute("aria-expanded",String(!expanded));b.textContent=expanded?"Baca selengkapnya":"Lebih sedikit"});
}
function playerRecommendations(currentId){
 const related=state.videos.filter(x=>String(x.id)!==String(currentId)).slice(0,8);
 if(!related.length)return "";
 return '<section class="player-recommendations"><div class="player-recommendation-heading"><h3>Video lainnya</h3><span>'+related.length+' rekomendasi</span></div><div class="recommendation-grid">'+related.map(v=>'<button class="recommendation-card" type="button" data-recommend="'+esc(v.id)+'"><span class="recommendation-thumb">'+(v.thumbnail_url?'<img loading="lazy" src="'+esc(v.thumbnail_url)+'" alt="">':'<span>A.</span>')+'</span><span class="recommendation-copy"><b>'+esc(v.title)+'</b><small>'+(v.is_exclusive?'✦ Eksklusif':'Gratis')+' · '+Number(v.views||0).toLocaleString("id-ID")+' views</small></span></button>').join("")+'</div></section>';
}
async function openVideo(id){
 const v=state.videos.find(x=>String(x.id)===String(id));if(!v)return;
 const locked=v.is_exclusive&&!hasPremium();
 const recommendations=playerRecommendations(v.id);
 const lockMarkup='<div class="premium-lock-card"><div class="premium-lock-icon">✦</div><span class="premium-lock-kicker">ASUPANMEME PREMIUM</span><h2>Akses khusus anggota</h2><p>Video ini termasuk konten eksklusif. Aktifkan membership untuk membuka dan menonton video ini selama masa aktif paket.</p><div class="premium-lock-actions"><button class="btn btn-primary" id="checkPremiumAccess" type="button">↻ Periksa akses</button><button class="btn btn-outline" id="unlockNow" type="button">Lihat paket premium</button>'+(!state.user?'<button class="btn btn-ghost" id="premiumLogin" type="button">Masuk ke akun</button>':"")+'</div><small>Sudah berlangganan? Tekan “Periksa akses” setelah login atau setelah membership diaktifkan admin.</small></div>';
 const playerMarkup='<div class="player-page"><div class="player-toolbar"><span class="player-brand">ASUPANMEME <i> / PLAYER</i></span><button class="player-close" id="playerClose" type="button" aria-label="Tutup pemutar">×</button></div><div class="video-player'+(locked?' premium-locked':'')+'" id="videoPlayer">'+(locked?lockMarkup:'<span class="muted">Menyiapkan video...</span>')+'</div><div class="player-details"><div><h2 id="modalTitle">'+esc(v.title)+'</h2><p>'+Number(v.views||0).toLocaleString("id-ID")+' views · '+new Date(v.created_at).toLocaleDateString("id-ID")+'</p></div><span class="player-access">'+(v.is_exclusive?'✦ EKSKLUSIF':'GRATIS')+'</span></div>'+(v.description?'<p class="player-description">'+esc(v.description)+'</p>':'')+recommendations+'</div>';
 modal(playerMarkup);
 $("#mainModal").classList.add("player-modal");
 $("#modalBackdrop").classList.add("player-mode");
 $("#playerClose").onclick=closeModal;
 $$("#mainModal [data-recommend]").forEach(b=>b.onclick=()=>openVideo(b.dataset.recommend));
 if(locked){
  $("#checkPremiumAccess").onclick=async()=>{if(!state.user){openAccount();return}const button=$("#checkPremiumAccess");button.disabled=true;button.textContent="Memeriksa...";await loadProfile();if(hasPremium()){toast("Membership aktif. Video siap diputar.");openVideo(v.id)}else{button.disabled=false;button.textContent="↻ Periksa akses";toast("Akses premium belum aktif. Periksa status membership atau hubungi admin.")}};
  $("#unlockNow").onclick=membershipPanel;
  if($("#premiumLogin"))$("#premiumLogin").onclick=openAccount;
  return;
 }
 const player=$("#videoPlayer");
 if(v.storage_path){
  try{
   const {data:{session}}=await db.auth.getSession();
   const response=await fetch("/api/playback",{method:"POST",headers:{"content-type":"application/json",...(session?.access_token?{Authorization:"Bearer "+session.access_token}:{})},body:JSON.stringify({video_id:v.id})});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||"Tidak dapat memutar video.");
   player.innerHTML='<video controls autoplay playsinline preload="metadata" src="'+esc(result.url)+'"></video>';
  }catch(error){player.innerHTML='<div class="player-error">'+esc(error.message||"Tidak dapat memutar video.")+'</div>'}
 }else if(v.video_url){
  player.innerHTML='<video controls autoplay playsinline preload="metadata" src="'+esc(v.video_url)+'"></video>';
 }else{
  player.innerHTML='<div class="player-error">Video belum memiliki sumber pemutaran.</div>';
 }
}
async function membershipPanel(){if(!state.user){openAccount();toast("Login terlebih dahulu untuk berlangganan.");return}let plans=[{id:"weekly",name:"Premium 7 Hari",price:5000,duration_days:7},{id:"lifetime",name:"Premium Permanen",price:20000,duration_days:0}];if(db){const {data}=await db.from("subscription_plans").select("*").eq("active",true).order("price");if(data?.length)plans=data}let payment={};if(db){const {data}=await db.from("site_settings").select("key,value").in("key",["payment_instructions","payment_account"]);(data||[]).forEach(x=>payment[x.key]=x.value)}modal(`<p class="eyebrow">ASUPANMEME MEMBERSHIP</p><h2 id="modalTitle">Pilih akses premium</h2><p>Nikmati video eksklusif setelah pembayaran diverifikasi admin. Premium 7 hari berakhir otomatis setelah masa aktif habis; paket permanen tidak kedaluwarsa.</p><div class="plans">${plans.map(p=>'<div class="plan '+(p.id==="quarterly"?"featured":"")+'"><h3>'+esc(p.name)+'</h3><strong>'+money(p.price)+'</strong><p>'+(Number(p.duration_days)===0?"Akses permanen tanpa kedaluwarsa":'Akses selama '+(p.duration_days||7)+' hari')+'</p><button class="btn btn-primary" data-plan="'+esc(p.id)+'">Pilih paket</button></div>').join("")}</div><section class="qris-payment"><h3>Pembayaran QRIS</h3><p>Scan QRIS di bawah melalui aplikasi mobile banking atau e-wallet. Pastikan nominal sesuai paket yang dipilih.</p><img src="/qris.png" alt="QRIS pembayaran ASUPANMEME" loading="lazy"><small>Nama merchant pada QRIS: FAD STORE - GAME. Periksa nama merchant sebelum membayar.</small></section><div class="field"><label>Instruksi pembayaran dari admin</label><textarea readonly rows="3">${esc(payment.payment_instructions||"Admin belum mengatur instruksi pembayaran. Silakan hubungi admin situs.")}${payment.payment_account?"\n"+payment.payment_account:""}</textarea></div><p class="muted">Setelah transfer, unggah bukti pembayaran di formulir berikutnya. Jangan unggah PIN, password, atau data kartu.</p>`);$("[data-plan]").forEach(b=>b.onclick=()=>paymentPanel(plans.find(p=>String(p.id)===b.dataset.plan)))}
function paymentPanel(plan){if(!plan)return;modal(`<p class="eyebrow">PAYMENT SUBMISSION</p><h2 id="modalTitle">Kirim bukti pembayaran</h2><p>Paket: <b>${esc(plan.name)}</b> · <b>${money(plan.price)}</b></p><form class="form-stack" id="paymentForm"><div class="field"><label>Nama pengirim</label><input name="sender" required maxlength="100"></div><div class="field"><label>Metode pembayaran</label><select name="method"><option selected>QRIS</option><option>Transfer bank</option><option>E-wallet</option><option>Lainnya</option></select></div><div class="field"><label>Catatan (opsional)</label><input name="note" maxlength="200" placeholder="Contoh: transfer pukul 14.00"></div><div class="field"><label>Foto bukti transfer (JPG, PNG, WEBP maks. 5 MB)</label><input name="proof" type="file" accept="image/jpeg,image/png,image/webp" required></div><button class="btn btn-primary">Kirim untuk verifikasi</button></form>`);$("#paymentForm").onsubmit=async e=>{e.preventDefault();if(!db){toast("Supabase belum dikonfigurasi.");return}const f=new FormData(e.currentTarget),file=f.get("proof");if(!file||file.size>5*1024*1024){toast("Pilih gambar maksimal 5 MB.");return}const ext=file.name.split(".").pop().toLowerCase();if(!["jpg","jpeg","png","webp"].includes(ext)){toast("Format gambar tidak didukung.");return}const path=state.user.id+"/"+crypto.randomUUID()+"."+ext;const {error:upErr}=await db.storage.from("payment-proofs").upload(path,file,{contentType:file.type,upsert:false});if(upErr){toast("Upload gagal: "+upErr.message);return}const {error}=await db.from("payment_submissions").insert({user_id:state.user.id,plan_id:plan.id,plan_name:plan.name,amount:plan.price,sender_name:f.get("sender"),payment_method:f.get("method"),note:f.get("note"),proof_path:path,status:"pending"});if(error){toast("Pengiriman gagal: "+error.message);return}closeModal();toast("Bukti terkirim. Tunggu verifikasi admin.");}}

async function uploadPanel(){if(!state.user){openAccount();toast("Login terlebih dahulu.");return}const isAdmin=state.profile?.role==="admin";modal(`<p class="eyebrow">COMMUNITY UPLOAD</p><h2 id="modalTitle">Upload video</h2><p>${isAdmin?"Sebagai admin, kamu bisa langsung menerbitkan video Gratis atau Eksklusif.":"Video yang kamu kirim akan masuk antrean pemeriksaan admin dan hanya dapat diterbitkan sebagai Gratis."}</p><div class="upload-promo"><strong>Punya video menarik? Bagikan di ASUPANMEME.</strong><p>Unggah video gratis untuk komunitas. Kontributor yang aktif dan rutin berbagi berkesempatan mendapatkan penawaran akses eksklusif dari admin.</p><small>Setiap unggahan akan ditinjau sebelum ditayangkan. Penawaran eksklusif diberikan berdasarkan evaluasi admin.</small></div><form class="form-stack" id="videoUploadForm"><div class="field"><label>Judul video</label><input name="title" required maxlength="120" placeholder="Judul video"></div><div class="field"><label>Deskripsi</label><textarea name="description" rows="3" maxlength="1000" placeholder="Deskripsi video (opsional)"></textarea></div><div class="field"><label>File video (MP4, WEBM, MOV; maksimal 500 MB)</label><input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" required></div><div class="field"><label>Thumbnail (opsional, JPG/PNG/WEBP maks. 5 MB)</label><input name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp"></div>${isAdmin?'<div class="field"><label>Akses video</label><select name="access"><option value="free">Gratis</option><option value="exclusive">Eksklusif</option></select></div>':'<div class="field"><label>Akses video</label><input value="Gratis (wajib)" disabled></div>'}<button class="btn btn-primary" type="submit">Kirim video</button></form>`);$("#videoUploadForm").onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form),video=f.get("video"),thumb=f.get("thumbnail");if(!db||!state.user){toast("Silakan login ulang.");return}if(!video||!video.type.startsWith("video/")||video.size>500*1024*1024){toast("Pilih video valid maksimal 500 MB.");return}if(thumb?.size>5*1024*1024){toast("Thumbnail maksimal 5 MB.");return}const btn=form.querySelector("button[type=submit]");btn.disabled=true;btn.textContent="Mengunggah...";const ext=(video.name.split(".").pop()||"mp4").toLowerCase();const path=state.user.id+"/"+crypto.randomUUID()+"."+ext;const {error:upErr}=await db.storage.from("media-videos").upload(path,video,{contentType:video.type,upsert:false});if(upErr){btn.disabled=false;btn.textContent="Kirim video";toast("Upload gagal: "+upErr.message);return}let thumbnail_url=null;if(thumb?.size){const tExt=thumb.name.split(".").pop().toLowerCase(),tPath=state.user.id+"/thumb-"+crypto.randomUUID()+"."+tExt;const {error:tErr}=await db.storage.from("video-thumbnails").upload(tPath,thumb,{contentType:thumb.type,upsert:false});if(!tErr){const {data:pub}=db.storage.from("video-thumbnails").getPublicUrl(tPath);thumbnail_url=pub.publicUrl}}const admin=state.profile?.role==="admin";const access=admin&&f.get("access")==="exclusive";const {error:dbErr}=await db.from("videos").insert({title:String(f.get("title")).trim(),description:String(f.get("description")||"").trim(),storage_path:path,thumbnail_url,is_exclusive:access,published:admin,uploader_id:state.user.id});if(dbErr){await db.storage.from("media-videos").remove([path]);btn.disabled=false;btn.textContent="Kirim video";toast("Gagal menyimpan data: "+dbErr.message);return}closeModal();toast(admin?"Video berhasil diterbitkan.":"Video terkirim dan menunggu persetujuan admin.");await loadVideos()}}
async function adminVideosPanel(){
 if(state.profile?.role!=="admin"){toast("Akses admin ditolak.");return}
 const {data,error}=await db.from("videos").select("id,title,description,thumbnail_url,is_exclusive,published,created_at,uploader_id,storage_path").order("created_at",{ascending:false}).limit(100);
 if(error){toast(error.message);return}
 modal(`<p class="eyebrow">VIDEO CONTROL</p><h2 id="modalTitle">Kelola video</h2><p>Edit informasi, ganti file, atur akses, terbitkan, atau hapus video.</p><div class="admin-list">${(data||[]).map(v=>'<div class="admin-row"><div><b>'+esc(v.title)+'</b><small>'+(v.is_exclusive?'EKSKLUSIF':'GRATIS')+' · '+(v.published?'Tayang':'Menunggu persetujuan')+'</small><small>'+new Date(v.created_at).toLocaleString("id-ID")+'</small></div><div class="admin-actions"><button data-edit-video="'+esc(v.id)+'">Edit video</button>'+(!v.published?'<button data-publish="'+esc(v.id)+'">Terbitkan gratis</button>':'')+'<button data-toggle="'+esc(v.id)+'">'+(v.is_exclusive?'Jadikan gratis':'Jadikan eksklusif')+'</button><button data-delete-video="'+esc(v.id)+'">Hapus</button></div></div>').join("")||'<p>Belum ada video.</p>'}</div><button class="btn btn-ghost" id="backAdminMain">Kembali ke dashboard</button>`);
 $("#backAdminMain").onclick=adminPanel;
 $("[data-edit-video]").forEach(b=>b.onclick=()=>editVideoPanel(data.find(v=>v.id===b.dataset.editVideo)));
 $("[data-publish]").forEach(b=>b.onclick=async()=>{const {error}=await db.from("videos").update({published:true,is_exclusive:false}).eq("id",b.dataset.publish);if(error){toast(error.message);return}toast("Video diterbitkan sebagai Gratis.");adminVideosPanel();loadVideos()});
 $("[data-toggle]").forEach(b=>b.onclick=async()=>{const row=data.find(v=>v.id===b.dataset.toggle);const {error}=await db.from("videos").update({is_exclusive:!row.is_exclusive,published:true}).eq("id",row.id);if(error){toast(error.message);return}toast("Akses video diperbarui.");adminVideosPanel();loadVideos()});
 $("[data-delete-video]").forEach(b=>b.onclick=async()=>{const row=data.find(v=>v.id===b.dataset.deleteVideo);if(!confirm("Hapus video ini secara permanen?"))return;if(row.storage_path)await db.storage.from("media-videos").remove([row.storage_path]);if(row.thumbnail_url){const thumbPath=row.thumbnail_url.split("/video-thumbnails/")[1];if(thumbPath)await db.storage.from("video-thumbnails").remove([decodeURIComponent(thumbPath)])}const {error}=await db.from("videos").delete().eq("id",row.id);if(error){toast(error.message);return}toast("Video dihapus.");adminVideosPanel();loadVideos()})
}
async function editVideoPanel(row){
 if(state.profile?.role!=="admin"||!row){toast("Akses admin ditolak.");return}
 modal(`<p class="eyebrow">ADMIN VIDEO EDITOR</p><h2 id="modalTitle">Edit video</h2><p>Ubah judul, deskripsi, thumbnail, file video, status tayang, dan jenis akses.</p><form class="form-stack" id="videoEditForm">
 <div class="field"><label>Judul video</label><input name="title" required maxlength="120" value="${esc(row.title||"")}"></div>
 <div class="field"><label>Deskripsi</label><textarea name="description" rows="4" maxlength="1000">${esc(row.description||"")}</textarea></div>
 <div class="field"><label>Ganti file video (opsional; MP4/WEBM/MOV, maksimal 500 MB)</label><input name="video" type="file" accept="video/mp4,video/webm,video/quicktime"><small>Biarkan kosong jika tidak ingin mengganti video.</small></div>
 <div class="field"><label>Ganti thumbnail (opsional; JPG/PNG/WEBP, maksimal 5 MB)</label><input name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp"><small>Biarkan kosong untuk mempertahankan thumbnail saat ini.</small></div>
 <label class="check-row"><input type="checkbox" name="removeThumbnail"> Hapus thumbnail saat ini</label>
 <div class="field"><label>Akses video</label><select name="access"><option value="free" ${row.is_exclusive?"":"selected"}>Gratis</option><option value="exclusive" ${row.is_exclusive?"selected":""}>Eksklusif</option></select></div>
 <div class="field"><label>Status publikasi</label><select name="published"><option value="true" ${row.published?"selected":""}>Tayang</option><option value="false" ${row.published?"":"selected"}>Draft / menunggu</option></select></div>
 <div class="form-stack"><button class="btn btn-primary" type="submit">Simpan perubahan</button><button class="btn btn-ghost" type="button" id="cancelVideoEdit">Batal</button></div>
 </form>`);
 $("#cancelVideoEdit").onclick=adminVideosPanel;
 $("#videoEditForm").onsubmit=async e=>{
  e.preventDefault();
  if(state.profile?.role!=="admin"||!state.user){toast("Sesi admin tidak valid. Login ulang.");return}
  const form=e.currentTarget,f=new FormData(form),video=f.get("video"),thumb=f.get("thumbnail");
  if(video?.size&&(!video.type.startsWith("video/")||video.size>500*1024*1024)){toast("File video tidak valid atau melebihi 500 MB.");return}
  if(thumb?.size&&(!thumb.type.startsWith("image/")||thumb.size>5*1024*1024)){toast("Thumbnail tidak valid atau melebihi 5 MB.");return}
  const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent="Menyimpan...";
  let nextPath=row.storage_path,nextThumb=row.thumbnail_url;
  let uploadedVideo=null,uploadedThumb=null;
  if(video?.size){
   const ext=(video.name.split(".").pop()||"mp4").toLowerCase(),path=state.user.id+"/admin-edit-"+crypto.randomUUID()+"."+ext;
   const {error}=await db.storage.from("media-videos").upload(path,video,{contentType:video.type,upsert:false});
   if(error){btn.disabled=false;btn.textContent="Simpan perubahan";toast("Gagal mengunggah video baru: "+error.message);return}
   uploadedVideo=path;nextPath=path;
  }
  if(thumb?.size){
   const ext=(thumb.name.split(".").pop()||"jpg").toLowerCase(),path=state.user.id+"/admin-thumb-"+crypto.randomUUID()+"."+ext;
   const {error}=await db.storage.from("video-thumbnails").upload(path,thumb,{contentType:thumb.type,upsert:false});
   if(error){if(uploadedVideo)await db.storage.from("media-videos").remove([uploadedVideo]);btn.disabled=false;btn.textContent="Simpan perubahan";toast("Gagal mengunggah thumbnail: "+error.message);return}
   uploadedThumb=path;const {data:pub}=db.storage.from("video-thumbnails").getPublicUrl(path);nextThumb=pub.publicUrl;
  }else if(f.get("removeThumbnail")==="on"){nextThumb=null}
  const changes={title:String(f.get("title")).trim(),description:String(f.get("description")||"").trim(),storage_path:nextPath,thumbnail_url:nextThumb,is_exclusive:f.get("access")==="exclusive",published:f.get("published")==="true"};
  const {error}=await db.from("videos").update(changes).eq("id",row.id);
  if(error){
   if(uploadedVideo)await db.storage.from("media-videos").remove([uploadedVideo]);
   if(uploadedThumb)await db.storage.from("video-thumbnails").remove([uploadedThumb]);
   btn.disabled=false;btn.textContent="Simpan perubahan";toast("Gagal menyimpan perubahan: "+error.message);return;
  }
  if(uploadedVideo&&row.storage_path)await db.storage.from("media-videos").remove([row.storage_path]);
  if((uploadedThumb||f.get("removeThumbnail")==="on")&&row.thumbnail_url){const oldPath=row.thumbnail_url.split("/video-thumbnails/")[1];if(oldPath)await db.storage.from("video-thumbnails").remove([decodeURIComponent(oldPath)])}
  toast("Perubahan video berhasil disimpan.");await loadVideos();adminVideosPanel();
 };
}
async function adminPanel(){
 if(state.profile?.role!=="admin"){toast("Akses admin ditolak. Pastikan role akun adalah admin.");return}
 if(!db){toast("Koneksi database belum tersedia.");return}
 const {data,error}=await db.from("payment_submissions").select("*").order("created_at",{ascending:false});
 if(error){toast("Gagal memuat pembayaran: "+error.message);return}
 modal(`
  <p class="eyebrow">ADMIN CONTROL CENTER</p>
  <h2 id="modalTitle">Dashboard admin</h2>
  <p>Kelola seluruh konten ASUPANMEME dari sini. Hak admin dapat mengelola video gratis maupun eksklusif tanpa membership berbayar.</p>
  <div class="form-stack" style="margin:18px 0 24px">
   <button class="btn btn-primary" id="manageVideos" type="button">▶ Kelola semua video</button>
   <button class="btn btn-ghost" id="uploadAdminVideo" type="button">＋ Upload video baru</button>
  </div>
  <div style="border-top:1px solid #37313b;padding-top:18px">
   <p class="eyebrow">MEMBERSHIP</p>
   <h3 style="font-size:16px;margin:0 0 6px">Verifikasi pembayaran</h3>
   <p>Periksa bukti pembayaran sebelum mengaktifkan membership pengguna.</p>
   <div class="admin-list">${(data||[]).map(x=>'<div class="admin-row"><div><b>'+esc(x.plan_name)+' · '+money(x.amount)+'</b><small>'+esc(x.sender_name)+' · '+esc(x.payment_method)+' · '+esc(x.status)+'</small><small>'+new Date(x.created_at).toLocaleString("id-ID")+'</small><button class="inline-link" data-proof="'+esc(x.id)+'">Lihat bukti</button></div><div class="admin-actions">'+(x.status==="pending"?'<button data-approve="'+esc(x.id)+'">Setujui</button><button data-reject="'+esc(x.id)+'">Tolak</button>':"")+'</div></div>').join("")||'<p>Belum ada pembayaran masuk.</p>'}</div>
   <p class="muted">Persetujuan memanggil database function yang memvalidasi hak admin dan mengaktifkan masa membership.</p>
  </div>`);
 $("#manageVideos").onclick=adminVideosPanel;
 $("#uploadAdminVideo").onclick=uploadPanel;
 $("[data-proof]").forEach(b=>b.onclick=async()=>{
  const row=data.find(x=>x.id===b.dataset.proof);
  const {data:file,error}=await db.storage.from("payment-proofs").createSignedUrl(row.proof_path,90);
  if(error){toast(error.message);return}
  modal(`<h2 id="modalTitle">Bukti pembayaran</h2><img src="${esc(file.signedUrl)}" style="width:100%;border-radius:12px;margin-top:18px" alt="Bukti transfer"><button class="btn btn-ghost" id="backAdmin" style="margin-top:15px">Kembali</button>`);
  $("#backAdmin").onclick=adminPanel
 });
 $("[data-approve]").forEach(b=>b.onclick=()=>reviewPayment(b.dataset.approve,true));
 $("[data-reject]").forEach(b=>b.onclick=()=>reviewPayment(b.dataset.reject,false))
}
async function reviewPayment(id,approve){const note=approve?"Pembayaran diverifikasi":"Bukti pembayaran ditolak";const {error}=await db.rpc("review_payment",{submission_id:id,approve_payment:approve,admin_note:note});if(error){toast("Gagal memproses: "+error.message);return}toast(approve?"Pembayaran disetujui. Membership diaktifkan.":"Pembayaran ditolak.");adminPanel();loadProfile()}
function nav(view){state.view=view;$("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));closeSidebar();renderVideos();document.querySelector(".section-heading.section-spaced")?.scrollIntoView({behavior:"smooth",block:"start"})}
document.addEventListener("click",e=>{const v=e.target.closest("[data-view]");if(v)nav(v.dataset.view);const a=e.target.closest("[data-action]");if(a){if(a.dataset.action==="account")openAccount();if(a.dataset.action==="membership")membershipPanel();if(a.dataset.action==="upload")uploadPanel()}});
$$("[data-filter]").forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;state.page=1;$$("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));renderVideos()});
$("#pagination").onclick=e=>{const b=e.target.closest("[data-page]");if(!b||b.disabled)return;state.page=Number(b.dataset.page);renderVideos();$("#videoGrid").scrollIntoView({behavior:"smooth",block:"start"})};
$("#searchInput").oninput=e=>{state.search=e.target.value.trim().toLowerCase();state.page=1;renderVideos()};
$("#sortSelect").onchange=e=>{state.videos.sort((a,b)=>e.target.value==="popular"?(b.views||0)-(a.views||0):e.target.value==="az"?a.title.localeCompare(b.title):new Date(b.created_at)-new Date(a.created_at));state.page=1;renderVideos()};
const sidebar=$("#sidebar"),sidebarOverlay=$("#sidebarOverlay");
function closeSidebar(){sidebar.classList.remove("open");sidebarOverlay.classList.remove("visible");document.body.classList.remove("sidebar-open")}
function toggleSidebar(){const opening=!sidebar.classList.contains("open");sidebar.classList.toggle("open",opening);sidebarOverlay.classList.toggle("visible",opening);document.body.classList.toggle("sidebar-open",opening)}
$("#menuToggle").onclick=toggleSidebar;
$("#sidebarClose").onclick=closeSidebar;
sidebarOverlay.onclick=closeSidebar;
$("#modalClose").onclick=closeModal;
$("#modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")closeModal()};
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModal();closeSidebar()}});


if(sessionStorage.getItem("asm_age_confirmed")==="yes")$("#ageGate").classList.add("hidden");
$("#year").textContent=$("#footerYear").textContent=new Date().getFullYear();
async function init(){if(db){const {data}=await db.auth.getSession();state.user=data.session?.user||null;if(state.user)await loadProfile();db.auth.onAuthStateChange(async(_event,session)=>{state.user=session?.user||null;if(state.user)await loadProfile();else state.profile=null;refreshAuth()})}refreshAuth();await loadVideos();if(!configured)toast("Mode demo: isi config.js dan jalankan supabase/schema.sql untuk mengaktifkan akun & pembayaran.")}init();
})();