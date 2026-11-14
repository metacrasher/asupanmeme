(() => {
"use strict";
const $ = (s,root=document) => root.querySelector(s);
const $$ = (s,root=document) => [...root.querySelectorAll(s)];
// Handle navigation and close controls in one capture-phase listener so
// nested elements, overlays, and other delegated handlers cannot conflict.
document.addEventListener("click", event => {
 const target=event.target;
 if(!(target instanceof Element))return;
 if(target.closest("#modalClose,.modal-close,[data-close-modal]")){
  event.preventDefault();
  event.stopImmediatePropagation();
  if(typeof closeModal==="function")closeModal();
  return;
 }
 if(target.closest("#menuToggle,[data-toggle-sidebar]")){
  event.preventDefault();
  event.stopImmediatePropagation();
  toggleSidebar();
  return;
 }
 if(target.closest("#sidebarClose,.sidebar-close,[data-close-sidebar],#sidebarOverlay")){
  event.preventDefault();
  event.stopImmediatePropagation();
  closeSidebar();
 }
},true);

// Age gate handler is registered immediately so unrelated initialization errors
// cannot leave the 18+ buttons without click handlers.
document.addEventListener("click", (event) => {
  const button = event.target.closest("#ageYes, #ageNo");
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  if (button.id === "ageYes") {
    try { sessionStorage.setItem("asm_age_confirmed", "yes"); } catch (_) {}
    const gate = document.getElementById("ageGate");
    if (gate) gate.classList.add("hidden");
    return;
  }

  document.body.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;text-align:center;padding:30px"><div><h1>Akses tidak tersedia</h1><p>Website ini hanya dapat diakses oleh pengunjung berusia 18 tahun ke atas.</p></div></main>';
}, true);
const cfg = window.APP_CONFIG || {};
const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
const db = configured ? window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY) : null;
// Use an isolated anonymous client for the published catalog so a logged-in
// member's JWT/RLS context cannot accidentally hide public video rows.
const savedIds=(()=>{try{const value=JSON.parse(localStorage.getItem("asm_saved")||"[]");return Array.isArray(value)?value:[]}catch(_){return[]} })();
const state = {user:null,profile:null,videos:[],filter:"all",view:"home",saved:new Set(savedIds),page:1,recommendationPage:1,search:""};
let dashboardBackGuard=false;
let playerHistoryOpen=false;
function protectDashboardBack(){dashboardBackGuard=true;history.pushState({asmDashboardGuard:true},"",location.href);}
window.addEventListener("popstate",()=>{
 if(playerHistoryOpen){playerHistoryOpen=false;closeModal(true);return}
 if(dashboardBackGuard&&!$("#modalBackdrop")?.classList.contains("hidden"))history.pushState({asmDashboardGuard:true},"",location.href);
});
const money = n => new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n||0);
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toast = msg => {const region=$("#toastRegion");if(!region)return;const el=document.createElement("div");el.className="toast";el.setAttribute("role","status");el.textContent=msg;region.append(el);requestAnimationFrame(()=>el.classList.add("toast-visible"));setTimeout(()=>{el.classList.remove("toast-visible");setTimeout(()=>el.remove(),220)},4200)};
const modal = html => {$("#modalBackdrop").classList.remove("player-mode");$("#mainModal").classList.remove("player-modal","auth-modal");$("#modalContent").innerHTML=html;$("#modalBackdrop").classList.remove("hidden");$("#modalBackdrop").setAttribute("aria-hidden","false")};
const closeModal = (fromHistory=false) => {
 const wasPlayer=$("#modalBackdrop").classList.contains("player-mode");
 dashboardBackGuard=false;
 const video=$("#videoPlayer video");
 if(video){video.pause();video.removeAttribute("src");video.load()}
 if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
 $("#modalBackdrop").classList.remove("player-mode");
 $("#mainModal").classList.remove("player-modal");
 $("#modalBackdrop").classList.add("hidden");
 $("#modalBackdrop").setAttribute("aria-hidden","true");
 if(wasPlayer&&playerHistoryOpen&&!fromHistory){playerHistoryOpen=false;history.back()}
};
const demoVideos = [
 {id:"demo1",title:"Contoh video pilihan hari ini",description:"Video demo untuk memperlihatkan tampilan katalog.",thumbnail:"",duration:"08:24",views:12400,created_at:new Date().toISOString(),is_exclusive:false,video_url:""},
 {id:"demo2",title:"Koleksi eksklusif — preview",description:"Preview katalog premium. Tambahkan video milikmu melalui database.",thumbnail:"",duration:"12:10",views:8900,created_at:new Date(Date.now()-86400000).toISOString(),is_exclusive:true,video_url:""},
 {id:"demo3",title:"Rekomendasi komunitas",description:"Contoh kartu video ASUPANMEME.",thumbnail:"",duration:"06:42",views:7300,created_at:new Date(Date.now()-172800000).toISOString(),is_exclusive:false,video_url:""},
 {id:"demo4",title:"Premium selection",description:"Konten khusus anggota aktif.",thumbnail:"",duration:"15:02",views:6200,created_at:new Date(Date.now()-259200000).toISOString(),is_exclusive:true,video_url:""}
];
function openAccount(){if(state.user){accountPanel();return}modal(`<p class="eyebrow">WELCOME BACK</p><h2 id="modalTitle">Masuk ke akun</h2><p>Pengguna masuk dengan username. Admin masuk menggunakan email admin. Gunakan password yang sama seperti saat mendaftar.</p><form class="form-stack" id="authForm"><div class="field"><label>Username atau email admin</label><input name="identity" type="text" required autocomplete="username" maxlength="254" placeholder="Masukkan username"></div><div class="field"><label>Password</label><input name="password" type="password" required autocomplete="current-password" placeholder="Masukkan password"></div><button class="btn btn-primary" type="submit">Masuk</button></form><p class="muted">Pastikan username dan password benar. Simpan informasi login kamu agar tidak lupa.</p><p class="form-foot">Belum punya akun? <button class="inline-link" id="showSignup">Daftar sekarang</button></p>`);$("#mainModal").classList.add("auth-modal");$("#authForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),identity=String(f.get("identity")||"").trim().toLowerCase();if(!db){toast("Layanan akun belum terhubung. Silakan coba lagi nanti.");return}let loginEmail=identity;if(!identity.includes("@")){if(!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(identity)){toast("Username harus 3–24 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.");return}loginEmail=identity+"@members.asupanmeme.invalid"}const submit=e.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="Memeriksa...";const {data,error}=await db.auth.signInWithPassword({email:loginEmail,password:f.get("password")});if(error){submit.disabled=false;submit.textContent="Masuk";toast("Username/email atau password tidak sesuai. Periksa kembali data login kamu.");return}state.user=data.user;await loadProfile();closeModal();refreshAuth();toast("Selamat datang kembali di ASUPANMEME.");};$("#showSignup").onclick=signupPanel}
function signupPanel(){modal(`<p class="eyebrow">JOIN THE COMMUNITY</p><h2 id="modalTitle">Buat akun ASUPANMEME</h2><p>Daftar cukup dengan username dan password. Email tidak diperlukan untuk akun anggota.</p><form class="form-stack" id="signupForm"><div class="field"><label>Username</label><input name="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,23}" autocomplete="username" placeholder="Contoh: namakamu"></div><div class="field"><label>Password</label><input name="password" type="password" minlength="8" required autocomplete="new-password" placeholder="Minimal 8 karakter"></div><div class="field"><label>Ulangi password</label><input name="passwordConfirm" type="password" minlength="8" required autocomplete="new-password" placeholder="Masukkan ulang password"></div><p class="muted">Penting: ingat username dan password ini. Akun anggota tidak menggunakan email untuk pemulihan password, jadi simpan informasi login di tempat yang aman dan jangan bagikan kepada siapa pun.</p><button class="btn btn-primary" type="submit">Buat akun</button></form><p class="form-foot">Sudah punya akun? <button class="inline-link" id="showLogin">Masuk</button></p>`);$("#mainModal").classList.add("auth-modal");$("#signupForm").onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form),username=String(f.get("username")||"").trim().toLowerCase(),password=String(f.get("password")||"");if(!db){toast("Layanan akun belum terhubung. Silakan coba lagi nanti.");return}if(!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(username)){toast("Username harus 3–24 karakter dan hanya memakai huruf, angka, titik, _ atau -.");return}if(password!==f.get("passwordConfirm")){toast("Konfirmasi password belum sama.");return}const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent="Membuat akun...";const {data,error}=await db.auth.signUp({email:username+"@members.asupanmeme.invalid",password,options:{data:{username,display_name:username}}});if(error){btn.disabled=false;btn.textContent="Buat akun";toast(error.message.toLowerCase().includes("already")?"Username tersebut sudah digunakan. Silakan pilih username lain.":"Pendaftaran gagal: "+error.message);return}if(data.user){if(data.session){state.user=data.user;await loadProfile();closeModal();refreshAuth();toast("Akun berhasil dibuat. Selamat bergabung!");}else{toast("Akun berhasil dibuat. Jika belum bisa masuk, silakan hubungi admin.");closeModal()}}};$("#showLogin").onclick=openAccount}
async function loadProfile(){if(!db||!state.user)return null;const {data,error}=await db.from("profiles").select("*").eq("id",state.user.id).maybeSingle();if(error)throw error;state.profile=data||null;return state.profile}
function membershipState(profile){
 const status=String(profile?.subscription_status||"free").toLowerCase();
 const expiry=profile?.subscription_expires_at?new Date(profile.subscription_expires_at):null;
 if(status==="active"&&!expiry)return {label:"Aktif · Permanen",detail:"Membership tidak memiliki tanggal kedaluwarsa.",kind:"approved"};
 if(status==="active"&&expiry&&expiry.getTime()>Date.now())return {label:"Aktif",detail:"Berakhir pada "+expiry.toLocaleString("id-ID",{dateStyle:"long",timeStyle:"short"}),kind:"approved"};
 if(status==="active"&&expiry&&expiry.getTime()<=Date.now())return {label:"Kedaluwarsa",detail:"Masa membership telah berakhir pada "+expiry.toLocaleString("id-ID",{dateStyle:"long",timeStyle:"short"}),kind:"rejected"};
 if(status==="pending")return {label:"Menunggu pembayaran",detail:"Pengajuan sedang menunggu pemeriksaan admin.",kind:"pending"};
 if(status==="rejected")return {label:"Tidak aktif",detail:"Pengajuan terakhir ditolak. Periksa riwayat transaksi untuk catatan admin.",kind:"rejected"};
 return {label:"Gratis",detail:"Akun saat ini menggunakan akses gratis.",kind:""};
}
async function accountPanel(){
 protectDashboardBack();
 const membership=membershipState(state.profile);
 modal(`<p class="eyebrow">MY ACCOUNT</p><h2 id="modalTitle">${esc(state.profile?.display_name||state.user.email)}</h2><p>${esc(state.profile?.role==="admin"?state.user.email:(state.profile?.username||"Akun anggota"))}</p>
 <section class="payment-history" style="margin:18px 0;padding:18px;border:1px solid #37313b;border-radius:14px;background:rgba(255,255,255,.025)">
  <p class="eyebrow">STATUS AKUN</p><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">Membership</h3><span class="status-pill ${membership.kind}">${esc(membership.label)}</span></div><p class="muted" style="margin:8px 0 0">${esc(membership.detail)}</p>
 </section>
 <div class="form-stack"><button class="btn btn-primary" id="uploadOpen">Upload video</button><button class="btn btn-ghost" id="myMembership">Kelola membership</button>${state.profile?.role==="admin"?'<button class="btn btn-ghost" id="adminOpen">Dashboard admin</button>':""}<button class="btn btn-ghost" id="logoutBtn">Keluar</button></div>`);
 $("#uploadOpen").onclick=uploadPanel;$("#myMembership").onclick=membershipPanel;
 if($("#adminOpen"))$("#adminOpen").onclick=adminPanel;
 $("#logoutBtn").onclick=async()=>{await db?.auth.signOut();state.user=null;state.profile=null;closeModal();refreshAuth();toast("Kamu sudah keluar.")};
}
async function transactionHistoryPanel(){
 if(!state.user){openAccount();toast("Silakan masuk untuk melihat riwayat transaksi.");return}
 protectDashboardBack();
 modal(`<p class="eyebrow">PAYMENT RECORDS</p><h2 id="modalTitle">Riwayat transaksi</h2><p class="muted">Riwayat pengajuan pembayaran dan hasil pemeriksaan admin.</p><div id="myPaymentHistory"><p class="muted">Memuat riwayat transaksi...</p></div>`);
 const target=$("#myPaymentHistory");
 if(!db){target.innerHTML='<p class="muted">Riwayat transaksi memerlukan koneksi database.</p>';return}
 const {data,error}=await db.from("payment_submissions").select("id,plan_name,amount,payment_method,status,admin_note,created_at,reviewed_at").eq("user_id",state.user.id).order("created_at",{ascending:false}).limit(50);
 if(error){target.innerHTML='<p class="muted">Riwayat belum dapat dimuat. Coba buka kembali menu ini.</p>';return}
 target.innerHTML=(data||[]).map(paymentStatusMarkup).join("")||'<p class="muted">Belum ada transaksi.</p>';
}
function paymentStatusMarkup(row){
 const labels={pending:"Menunggu verifikasi",approved:"Diterima admin",rejected:"Ditolak admin"};
 const cls=row.status==="approved"?"approved":row.status==="rejected"?"rejected":"pending";
 const reviewed=row.reviewed_at?`<small>Diperiksa admin: ${new Date(row.reviewed_at).toLocaleString("id-ID")}</small>`:"";
 const note=row.admin_note?`<small>Catatan admin: ${esc(row.admin_note)}</small>`:"";
 return `<article class="payment-status-row"><div><strong>${esc(row.plan_name)} · ${money(row.amount)}</strong><span class="status-pill ${cls}">${labels[row.status]||"Status tidak diketahui"}</span><small>Waktu pengajuan: ${new Date(row.created_at).toLocaleString("id-ID")}</small>${row.payment_method?`<small>Metode: ${esc(row.payment_method)}</small>`:""}${reviewed}${note}</div></article>`;
}
function refreshAuth(){
 $("#accountButton").textContent=state.user?(state.profile?.username||state.profile?.display_name||state.user.email||"U").slice(0,1).toUpperCase():"?";
 renderVideos();renderMembershipHero();
}
async function renderMembershipHero(){
 const priceNode=$("#heroPlanPrice"),loginLink=$("#heroLoginLink"),accountStatus=$("#heroAccountStatus");
 if(loginLink)loginLink.classList.toggle("hidden",Boolean(state.user));
 if(accountStatus){accountStatus.classList.toggle("hidden",!state.user);accountStatus.textContent=state.user?(hasPremium()?"✓ Membership aktif — selamat menonton":"Akun masuk · periksa akses pada video eksklusif"):""}
 if(!priceNode)return;
 let plans=[{name:"1 Bulan",price:35000,duration_days:30},{name:"3 Bulan",price:90000,duration_days:90}];
 if(db){try{const {data,error}=await db.from("subscription_plans").select("name,price,duration_days").eq("active",true).order("price");if(!error&&data?.length)plans=data}catch(error){console.warn("ASUPANMEME hero plans:",error)}}
 const lowest=plans.reduce((a,b)=>Number(a.price)<Number(b.price)?a:b);
 priceNode.textContent="Langganan "+esc(lowest.name)+" — "+money(lowest.price);
}
async function loadVideos(){
 if(!db){state.videos=demoVideos;renderVideos();return}
 try{
  // Use the active session: anon visitors see public videos, while signed-in
  // members/admins are evaluated by the matching Supabase RLS policies.
  const runQuery=async()=>{
   let result=await db.from("videos").select("id,title,description,thumbnail_url,duration,views,created_at,is_exclusive,video_url,storage_path,storage_provider").eq("published",true).order("created_at",{ascending:false});
   if(result.error?.code==="42703")result=await db.from("videos").select("id,title,description,thumbnail_url,duration,views,created_at,is_exclusive,video_url,storage_path").eq("published",true).order("created_at",{ascending:false});
   if(result.error)throw result.error;
   return result.data||[];
  };
  let timeoutId;
  const timeout=new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error("Waktu tunggu katalog habis. Periksa koneksi Supabase dan kebijakan RLS.")),15000)});
  try{state.videos=await Promise.race([runQuery(),timeout]);}
  finally{clearTimeout(timeoutId)}
  state.catalogError=null;
 }catch(error){
  console.error("ASUPANMEME loadVideos:",error);
  state.catalogError=error?.message||"Periksa koneksi dan kebijakan database.";
  // Keep any previously loaded catalog instead of making existing videos vanish.
  toast("Katalog gagal dimuat: "+state.catalogError);
 }finally{renderVideos()}
}
function hasPremium(){if(state.profile?.role==="admin")return true;return state.profile?.subscription_status==="active" && (!state.profile?.subscription_expires_at || new Date(state.profile.subscription_expires_at)>new Date())}
function card(v){
 const locked=v.is_exclusive&&!hasPremium();
 const accessButton=v.is_exclusive?`<button type="button" class="card-access-button ${locked?"is-locked":"is-unlocked"}" data-access-check="${esc(v.id)}">${locked?"🔒 Periksa Akses":"▶ Tonton Video"}</button>`:"";
 const caption=String(v.description||"").trim();
 return `<article class="video-card" data-video="${esc(v.id)}" tabindex="0" role="button" aria-label="Buka video ${esc(v.title)}"><div class="thumb">${v.thumbnail_url?'<img loading="lazy" src="'+esc(v.thumbnail_url)+'" alt="">':'<div class="thumb-placeholder">A.</div>'}${v.is_exclusive?'<span class="exclusive-tag">✦ EKSKLUSIF</span>':""}<span class="duration">${esc(v.duration||"VIDEO")}</span><button type="button" class="save-btn" data-save="${esc(v.id)}" aria-label="Simpan video">${state.saved.has(v.id)?"♥":"♡"}</button>${locked?'<span class="member-lock-label">🔒 MEMBER</span>':""}${accessButton}</div><div class="video-info"><h3>${esc(v.title)}</h3><p class="video-meta">${Number(v.views||0).toLocaleString("id-ID")} views · ${new Date(v.created_at).toLocaleDateString("id-ID")}</p>${caption?`<p class="video-caption">${esc(caption)}</p>`:""}</div></article>`;
}

function paginationMarkup(total,page,size,attr){
 const pages=Math.ceil(total/size);
 if(pages<=1)return "";
 const nums=Array.from(new Set([1,pages,page-1,page,page+1].filter(n=>n>=1&&n<=pages))).sort((x,y)=>x-y);
 let out="<nav class=\"pagination-controls\" aria-label=\"Navigasi halaman\">";
 out+="<button class=\"page-btn page-arrow\" type=\"button\" data-"+attr+"=\""+Math.max(1,page-1)+"\" "+(page===1?"disabled":"")+" aria-label=\"Sebelumnya\">‹</button>";
 let last=0;
 nums.forEach(n=>{
  if(last&&n-last>1)out+="<span class=\"page-ellipsis\">…</span>";
  out+="<button class=\"page-btn "+(n===page?"active":"")+"\" type=\"button\" data-"+attr+"=\""+n+"\" "+(n===page?"aria-current=\"page\"":"")+">"+n+"</button>";
  last=n;
 });
 out+="<button class=\"page-btn page-arrow\" type=\"button\" data-"+attr+"=\""+Math.min(pages,page+1)+"\" "+(page===pages?"disabled":"")+" aria-label=\"Berikutnya\">›</button></nav>";
 return out;
}

function renderVideos(){
 let list=[...state.videos];
 if(state.view==="popular")list.sort((a,b)=>(b.views||0)-(a.views||0));
 if(state.view==="latest")list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 if(state.view==="exclusive")list=list.filter(v=>v.is_exclusive);
 if(state.view==="saved")list=list.filter(v=>state.saved.has(v.id));
 if(state.filter==="free")list=list.filter(v=>!v.is_exclusive);
 if(state.filter==="exclusive")list=list.filter(v=>v.is_exclusive);
 if(state.search)list=list.filter(v=>(v.title+" "+(v.description||"")).toLowerCase().includes(state.search));
 const popular=[...state.videos].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,6);
 $("#popularGrid").innerHTML=popular.map(card).join("")||'<div class="loading-card">Belum ada video.</div>';
 const pageSize=6,pageCount=Math.max(1,Math.ceil(list.length/pageSize));
 state.page=Math.min(Math.max(1,state.page),pageCount);
 const start=(state.page-1)*pageSize;
 $("#videoGrid").innerHTML=list.slice(start,start+pageSize).map(card).join("");
 $("#videoCount").textContent=list.length+" video tersedia";
 $("#emptyState").classList.toggle("hidden",list.length>0);
 $("#pagination").innerHTML=paginationMarkup(list.length,state.page,pageSize,"page");
}
function exclusiveChannelMarkup(){
 return '<a class="exclusive-channel-link" href="https://whatsapp.com/channel/0029VbE3SGkCxoAqXnsbU135" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 2 17.7L.5 23.5l6-1.6A11.8 11.8 0 0 0 23.5 11a11.7 11.7 0 0 0-3-7.5ZM12 21a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.5.9.9-3.4-.2-.4A9.7 9.7 0 1 1 12 21Zm5.4-7.3c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2-.8 1-1 1.1-.4.2-.7 0a8 8 0 0 1-2.4-1.5 9 9 0 0 1-1.6-2c-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.6s-.7-1.7-1-2.3c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.2 1.2-1.2 2.8 1.2 3.2 1.4 3.4a13 13 0 0 0 5 4.4c.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.8-.8 2.1-1.5.3-.8.3-1.4.2-1.5s-.2-.3-.5-.4Z"/></svg><span>Gabung Saluran WhatsApp</span></a>';
}
async function showExclusiveGate(v, preservedScrollY, adminPreview=false){
 modal(`<div class="exclusive-gate-shell" data-exclusive-video="${esc(v.id)}">
  <div class="exclusive-gate-toolbar"><span class="player-brand">ASUPANMEME <i>/ EXCLUSIVE</i></span><button type="button" class="player-close" id="exclusiveGateClose" aria-label="Tutup">×</button></div>
  <div class="exclusive-gate-card" id="exclusiveGateCard" aria-live="polite">
   <div class="lock-animation" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="9" y="21" width="30" height="22" rx="5"></rect><path d="M15 21v-7a9 9 0 0 1 18 0v7"></path><circle cx="24" cy="31" r="2.5"></circle><path d="M24 33.5v4"></path></svg></div>
   <p class="eyebrow">EXCLUSIVE MEMBERSHIP</p><h2 id="exclusiveGateHeading">Video khusus member</h2>
   <p id="exclusiveGateMessage">Kamu bisa membuka halaman video ini, tetapi pemutaran hanya tersedia untuk akun dengan membership aktif. Tekan Periksa Akses untuk memverifikasi akun.</p>
   <div class="exclusive-check-progress" id="exclusiveCheckProgress" hidden><span></span></div>
  </div>
  <div class="exclusive-gate-actions" id="exclusiveGateActions">
   <button type="button" class="btn btn-primary" id="exclusiveCheckButton"><span aria-hidden="true">🔒</span> Periksa Akses</button>
   ${!state.user?'<button type="button" class="exclusive-login-link" id="exclusiveLogin">Sudah langganan? Masuk</button><button type="button" class="exclusive-login-link" id="exclusiveSignup">Belum punya akun? Daftar</button>':''}
  </div>
  <h2 class="exclusive-gate-title">${esc(v.title)}</h2>
  ${v.description?'<p class="player-description">'+esc(v.description)+'</p>':''}
  <p class="player-hint">Video terkunci sampai membership aktif berhasil diverifikasi.</p>
  ${exclusiveChannelMarkup()}
 </div>`);
 $("#mainModal").classList.add("player-modal");
 $("#modalBackdrop").classList.add("player-mode");
 $("#exclusiveGateClose").onclick=()=>closeModal();
 if($("#exclusiveLogin"))$("#exclusiveLogin").onclick=openAccount;
 if($("#exclusiveSignup"))$("#exclusiveSignup").onclick=signupPanel;
 const checkButton=$("#exclusiveCheckButton");
 let checking=false;
 checkButton.onclick=async()=>{
  if(checking)return;
  checking=true;
  checkButton.disabled=true;
  checkButton.innerHTML='<span aria-hidden="true">🔒</span> Memeriksa akses...';
  const card=$("#exclusiveGateCard");
  const heading=$("#exclusiveGateHeading");
  const message=$("#exclusiveGateMessage");
  const progress=$("#exclusiveCheckProgress");
  card?.classList.remove("is-denied","is-error");
  card?.classList.add("is-checking");
  if(heading)heading.textContent="Memeriksa akses...";
  if(message)message.textContent="Mohon tunggu 1 detik. Kami sedang memverifikasi status membership kamu.";
  if(progress)progress.hidden=false;
  const minimumWait=new Promise(resolve=>setTimeout(resolve,1000));
  let profileError=null;
  try{if(state.user)await loadProfile()}catch(error){profileError=error}
  await minimumWait;
  const shell=$(".exclusive-gate-shell");
  if(!shell||shell.dataset.exclusiveVideo!==String(v.id)||$("#modalBackdrop").classList.contains("hidden"))return;
  if(profileError){
   card?.classList.add("is-error");
   if(heading)heading.textContent="Pemeriksaan gagal";
   if(message)message.textContent="Status membership belum dapat diverifikasi. Periksa koneksi lalu coba lagi.";
   checkButton.disabled=false;
   checkButton.innerHTML='<span aria-hidden="true">🔒</span> Coba Periksa Lagi';
   checkButton.classList.add("is-retry");
   console.error("ASUPANMEME exclusive access check:",profileError);
   checking=false;
   return;
  }
  if(hasPremium()){
   openVideo(v.id,v,adminPreview,true);
   return;
  }
  card?.classList.remove("is-checking");
  card?.classList.add("is-denied");
  if(heading)heading.textContent=state.user?"Membership belum aktif":"Kamu belum masuk";
  if(message)message.textContent=state.user
   ?"Akun kamu belum memiliki membership aktif. Video tetap terkunci. Pilih paket untuk membuka akses."
   :"Kamu masih bisa melihat halaman video, tetapi belum masuk ke akun. Masuk jika sudah berlangganan atau daftar akun baru. Video tidak dapat diputar sebelum membership aktif.";
  if(progress)progress.hidden=true;
  const lock=card?.querySelector(".lock-animation");if(lock)lock.classList.add("lock-denied");
  checkButton.disabled=false;
  checkButton.innerHTML='<span aria-hidden="true">🔒</span> Periksa Akses Lagi';
  checkButton.classList.add("is-retry");
  if(state.user&&!$("#exclusiveBuy")){
   const buy=document.createElement("button");buy.type="button";buy.id="exclusiveBuy";buy.className="btn btn-primary";buy.textContent="Lihat Paket Membership";buy.onclick=membershipPanel;
   $("#exclusiveGateActions")?.append(buy);
  }
  checking=false;
 };
}
async function openVideo(id, previewVideo=null, adminPreview=false, accessVerified=false){
 const preservedScrollY=window.scrollY;
 const v=previewVideo||state.videos.find(x=>String(x.id)===String(id));if(!v)return;
 if(v.is_exclusive&&!adminPreview&&!accessVerified){await showExclusiveGate(v,preservedScrollY,adminPreview);return}
 if(v.is_exclusive&&!v.storage_path){modal(`<p class="eyebrow">EXCLUSIVE VIDEO</p><h2 id="modalTitle">${esc(v.title)}</h2><div class="player-error">Sumber video eksklusif belum tersimpan di penyimpanan privat. Video tidak akan diputar melalui tautan publik.</div><button type="button" class="btn btn-ghost" id="exclusiveStorageBack">Kembali</button>`);$("#exclusiveStorageBack").onclick=()=>showExclusiveGate(v,preservedScrollY,adminPreview);return}
 if(!v.video_url&&!v.storage_path){modal(`<p class="eyebrow">VIDEO PREVIEW</p><h2 id="modalTitle">${esc(v.title)}</h2><div class="video-player"><span class="muted">Video belum ditambahkan.</span></div><p>${esc(v.description||"")}</p>`);return}
 modal(`<div class="player-page">
  <div class="player-toolbar">
   <div class="player-brand">ASUPANMEME <i>/ NOW PLAYING</i></div>
   <div class="player-actions">
    
    <button type="button" class="player-tool" id="videoZoom" aria-pressed="false">↗ Perbesar</button>
    <button type="button" class="player-tool" id="videoFullscreen">⛶ Layar penuh</button>
    <button type="button" class="player-close" id="playerClose" aria-label="Tutup pemutar">×</button>
   </div>
  </div>
  <div class="video-player" id="videoPlayer"><div class="video-frame" id="videoFrame"><span class="muted">Menyiapkan video...</span></div><div class="video-controls"><button type="button" class="video-play-button" id="videoPlayPause" aria-pressed="false">▶ Putar video</button><span class="video-status" id="videoStatus">Siap diputar</span></div></div>
  <h2 class="player-title" id="modalTitle">${esc(v.title)}</h2>
  <p data-view-count>${Number(v.views||0).toLocaleString("id-ID")} views</p>
  <p class="player-description">${esc(v.description||"")}</p>
  ${v.is_exclusive?exclusiveChannelMarkup():""}
  <p class="player-hint">Gunakan kontrol di bagian bawah video untuk pause, lanjutkan, atur volume, dan posisi tontonan.</p>
  <section class="player-recommendations" id="playerRecommendations" aria-label="Video lainnya">
   <div class="player-recommendation-heading"><h3>Video lainnya</h3><span id="recommendationCount"></span></div>
   <div class="recommendation-grid" id="recommendationGrid"></div>
   <div class="recommendation-pagination" id="recommendationPagination"></div>
  </section>
 </div>`);
 $("#modalBackdrop").classList.add("player-mode");
 $("#mainModal").classList.add("player-modal");
 if(!playerHistoryOpen){history.pushState({asmPlayer:true,videoId:String(v.id)},"",location.href);playerHistoryOpen=true}
 $("#playerClose").onclick=()=>closeModal();
 state.recommendationPage=1;renderRecommendations(v.id);
 requestAnimationFrame(()=>window.scrollTo({top:preservedScrollY,left:0,behavior:"instant"}));
 try{
  let playbackUrl=v.video_url;
  if(v.storage_path){
   if(!db)throw new Error("Koneksi database tidak tersedia.");
   const {data:{session}}=await db.auth.getSession();
   const response=await fetch("/api/playback",{method:"POST",headers:{"content-type":"application/json",...(session?.access_token?{Authorization:"Bearer "+session.access_token}:{})},body:JSON.stringify({video_id:v.id,admin_preview:adminPreview})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||"Tidak dapat memutar video.");playbackUrl=result.url;
  }
  const player=$("#videoPlayer");
  if(!player||$("#modalBackdrop").classList.contains("hidden"))return;
  player.innerHTML='<div class="video-frame" id="videoFrame"><video controls playsinline webkit-playsinline preload="metadata" src="'+esc(playbackUrl)+'"></video></div><div class="video-controls"><button type="button" class="video-play-button" id="videoPlayPause" aria-pressed="false">▶ Putar video</button><span class="video-status" id="videoStatus">Memuat video…</span></div>';
  const video=player.querySelector("video");
  if(video&&db&&!String(v.id).startsWith("demo")){
   let counted=false;
   video.addEventListener("play",async()=>{
    if(counted)return;
    counted=true;
    const {data,error}=await db.rpc("increment_video_view",{target_video_id:v.id});
    if(error){counted=false;console.error("ASUPANMEME view counter:",error);return}
    const updatedViews=Number(data);
    if(Number.isFinite(updatedViews)){
     v.views=updatedViews;
     const label=$("#mainModal [data-view-count]");
     if(label)label.textContent=updatedViews.toLocaleString("id-ID")+" views";
     renderVideos();
    }
   });
  }
  const playPauseButton=$("#videoPlayPause");
  const videoFrame=$("#videoFrame");
  const videoStatus=$("#videoStatus");
  const zoomButton=$("#videoZoom");
  const fullscreenButton=$("#videoFullscreen");

  const syncPlayPause=()=>{
   const playing=!video.paused&&!video.ended;
   playPauseButton.textContent=playing?"Ⅱ Jeda video":"▶ Putar video";
   playPauseButton.setAttribute("aria-pressed",String(playing));
   if(videoStatus)videoStatus.textContent=video.ended?"Video selesai":playing?"Sedang diputar":"Dijeda";
  };
  const fitVideoFrame=()=>{
   if(!video.videoWidth||!video.videoHeight||!videoFrame)return;
   const ratio=video.videoWidth/video.videoHeight;
   const availableWidth=Math.min(900,Math.max(240,player.clientWidth-32));
   const maxHeight=Math.max(180,window.innerHeight*.56);
   videoFrame.style.width=Math.min(availableWidth,maxHeight*ratio)+"px";
   videoFrame.style.maxWidth="100%";
   videoFrame.style.aspectRatio=video.videoWidth+" / "+video.videoHeight;
   video.style.width="100%";
   video.style.height="100%";
   video.style.objectFit="contain";
   videoFrame.dataset.ratio=String(ratio);
  };
  video.addEventListener("loadedmetadata",fitVideoFrame);
  video.addEventListener("resize",fitVideoFrame);
  window.addEventListener("resize",fitVideoFrame,{passive:true});
  video.addEventListener("play",syncPlayPause);
  video.addEventListener("pause",syncPlayPause);
  video.addEventListener("ended",syncPlayPause);
  playPauseButton.onclick=async()=>{
   try{
    if(video.paused||video.ended)await video.play();
    else video.pause();
    syncPlayPause();
   }catch(error){toast("Video belum dapat diputar. Periksa koneksi atau sumber video.");}
  };
  syncPlayPause();

  zoomButton.onclick=()=>{
   const zoomed=video.classList.toggle("video-zoomed");
   zoomButton.textContent=zoomed?"↙ Normal":"↗ Perbesar";
   zoomButton.setAttribute("aria-pressed",String(zoomed));
   player.classList.toggle("video-zoom-active",zoomed);
  };
  fullscreenButton.onclick=async()=>{
   try{
    if(document.fullscreenElement){await document.exitFullscreen();return}
    if(videoFrame?.requestFullscreen){await videoFrame.requestFullscreen();}
    else if(player.requestFullscreen){await player.requestFullscreen();}
    else if(video.requestFullscreen){await video.requestFullscreen();}
    else if(video.webkitEnterFullscreen){video.webkitEnterFullscreen();}
    else{toast("Mode layar penuh tidak didukung browser ini.");}
   }catch(error){toast("Mode layar penuh tidak tersedia. Coba gunakan browser terbaru.");}
  };
 }catch(error){const player=$("#videoPlayer");if(player)player.innerHTML='<div class="player-error">'+esc(error?.message||"Terjadi kesalahan saat menyiapkan video.")+'</div>';console.error("ASUPANMEME playback:",error)}
}

function renderRecommendations(currentId){
 const items=state.videos.filter(x=>String(x.id)!==String(currentId));
 const size=6,pages=Math.max(1,Math.ceil(items.length/size));
 state.recommendationPage=Math.min(Math.max(1,state.recommendationPage),pages);
 const start=(state.recommendationPage-1)*size;
 const section=$("#playerRecommendations");
 if(section)section.dataset.currentVideoId=String(currentId);
 const grid=$("#recommendationGrid");if(!grid)return;
 grid.innerHTML=items.slice(start,start+size).map(x=>
  '<button type="button" class="recommendation-card" data-recommendation-video="'+esc(x.id)+'" aria-label="Putar '+esc(x.title)+'"><span class="recommendation-thumb">'+
  (x.thumbnail_url?'<img loading="lazy" src="'+esc(x.thumbnail_url)+'" alt="">':'<span>A.</span>')+
  '</span><span class="recommendation-copy"><b>'+esc(x.title)+'</b><small>'+Number(x.views||0).toLocaleString("id-ID")+' views</small></span></button>'
 ).join("")||'<p class="muted recommendation-empty">Belum ada video lainnya.</p>';
 const count=$("#recommendationCount");if(count)count.textContent=items.length+" video";
 const pager=$("#recommendationPagination");if(pager)pager.innerHTML=paginationMarkup(items.length,state.recommendationPage,size,"rec-page");
}

async function membershipPanel(){
 // Paket dan harga boleh dilihat publik; login baru diwajibkan saat memilih paket.
 let plans=[{id:"weekly",name:"Premium 7 Hari",price:5000,duration_days:7},{id:"lifetime",name:"Premium Permanen",price:20000,duration_days:0}],payment={};
 if(db){
  const [{data:planData,error:planError},{data:settingsData,error:settingsError}]=await Promise.all([
   db.from("subscription_plans").select("*").eq("active",true).order("price"),
   db.from("site_settings").select("key,value").in("key",["payment_instructions","payment_account","qris_image_url"])
  ]);
  if(!planError&&planData?.length)plans=planData;if(!settingsError)(settingsData||[]).forEach(x=>payment[x.key]=x.value);
 }
 modal(`<p class="eyebrow">ASUPANMEME MEMBERSHIP</p><h2 id="modalTitle">Pilih akses premium</h2><p>Nikmati video eksklusif setelah pembayaran diverifikasi admin. Premium 7 hari berakhir otomatis setelah masa aktif habis; paket permanen tidak kedaluwarsa.</p><div class="payment-notice" role="note"><div class="payment-notice-heading"><span class="payment-notice-icon" aria-hidden="true">!</span><strong>Perhatian — Ketentuan Pembayaran</strong></div><p>Pilih paket dan bayarkan nominal yang tepat sesuai harga yang tertera. Admin akan mencocokkan paket pilihan dengan jumlah pembayaran pada bukti transfer. Jika nominal atau paket tidak sesuai—misalnya memilih paket Rp5.000 tetapi membayar Rp20.000 untuk paket permanen—pengajuan dapat ditolak. Pembayaran yang tidak sesuai atau pengajuan yang ditolak tidak dapat dikembalikan (non-refundable). Periksa kembali paket dan nominal sebelum melakukan pembayaran.</p></div><div class="plans">${plans.map(p=>'<div class="plan '+(p.id==="quarterly"?"featured":"")+'"><h3>'+esc(p.name)+'</h3><strong>'+money(p.price)+'</strong><p>'+(Number(p.duration_days)===0?"Akses permanen tanpa kedaluwarsa":'Akses selama '+(p.duration_days||7)+' hari')+'</p><button class="btn btn-primary" data-plan="'+esc(p.id)+'">Pilih paket</button></div>').join("")}</div><section class="qris-payment"><h3>Pembayaran QRIS</h3><p>Scan QRIS melalui aplikasi mobile banking atau e-wallet. Pastikan nominal sesuai paket yang dipilih.</p>${payment.qris_image_url?'<img id="qrisImage" src="'+esc(payment.qris_image_url)+'" alt="QRIS pembayaran ASUPANMEME" loading="lazy">':'<div class="qris-missing">QRIS belum diunggah oleh admin. Silakan hubungi admin sebelum melakukan pembayaran.</div>'}<small>Pastikan nama merchant dan nominal sesuai sebelum menyelesaikan pembayaran.</small></section><div class="field"><label>Instruksi pembayaran dari admin</label><textarea readonly rows="3">${esc(payment.payment_instructions||"Admin belum mengatur instruksi pembayaran. Silakan hubungi admin situs.")}${payment.payment_account?"\n"+payment.payment_account:""}</textarea></div><p class="muted">Setelah transfer, pilih paket lalu unggah bukti pembayaran. Status akan tampil di akun sampai admin memverifikasi.</p>`);
 if($("#qrisImage"))$("#qrisImage").addEventListener("error",()=>{$("#qrisImage").outerHTML='<div class="qris-missing">Gambar QRIS tidak dapat dimuat. Hubungi admin untuk mendapatkan QRIS terbaru.</div>'});
 $$("[data-plan]").forEach(b=>b.onclick=()=>{if(!state.user){openAccount();toast("Login atau daftar terlebih dahulu untuk melanjutkan pembelian membership.");return}paymentPanel(plans.find(p=>String(p.id)===b.dataset.plan))});
}
function paymentPanel(plan){
 if(!plan)return;
 modal(`<p class="eyebrow">PAYMENT SUBMISSION</p><h2 id="modalTitle">Kirim bukti pembayaran</h2><p>Paket: <b>${esc(plan.name)}</b> · <b>${money(plan.price)}</b></p><div class="payment-notice payment-notice-compact" role="note"><div class="payment-notice-heading"><span class="payment-notice-icon" aria-hidden="true">!</span><strong>Konfirmasi sebelum mengirim</strong></div><p>Pastikan pembayaran yang Anda kirim tepat sebesar <b>${money(plan.price)}</b> untuk paket <b>${esc(plan.name)}</b>. Perbedaan nominal atau paket dapat menyebabkan pengajuan ditolak oleh admin. Pembayaran tidak dapat dikembalikan (non-refundable) apabila pengajuan ditolak karena ketidaksesuaian. Mohon periksa kembali sebelum melanjutkan.</p></div><form class="form-stack" id="paymentForm"><div class="field"><label>Nama pengirim</label><input name="sender" required maxlength="100"></div><div class="field"><label>Metode pembayaran</label><select name="method"><option selected>QRIS</option><option>Transfer bank</option><option>E-wallet</option><option>Lainnya</option></select></div><div class="field"><label>Catatan (opsional)</label><input name="note" maxlength="200" placeholder="Contoh: transfer pukul 14.00"></div><div class="field"><label>Foto bukti transfer (JPG, PNG, WEBP maks. 5 MB)</label><input name="proof" type="file" accept="image/jpeg,image/png,image/webp" required></div><button class="btn btn-primary" type="submit">Kirim untuk verifikasi</button></form>`);
 $("#paymentForm").onsubmit=async e=>{
  e.preventDefault();if(!db||!state.user){toast("Silakan login ulang sebelum mengirim pembayaran.");return}
  const form=e.currentTarget,f=new FormData(form),file=f.get("proof");
  if(!file||file.size>5*1024*1024){toast("Pilih gambar maksimal 5 MB.");return}
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){toast("Format bukti harus JPG, PNG, atau WEBP.");return}
  const submitButton=form.querySelector('button[type="submit"]');submitButton.disabled=true;submitButton.textContent="Mengirim bukti...";
  const ext=file.name.split(".").pop().toLowerCase(),path=state.user.id+"/"+crypto.randomUUID()+"."+ext;
  try{
   const {error:uploadError}=await db.storage.from("payment-proofs").upload(path,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;
   const {data:submission,error}=await db.from("payment_submissions").insert({user_id:state.user.id,plan_id:plan.id,plan_name:plan.name,amount:plan.price,sender_name:f.get("sender"),payment_method:f.get("method"),note:f.get("note"),proof_path:path,status:"pending"}).select("id,status,created_at").single();
   if(error)throw error;
   modal(`<div class="payment-pending"><span class="pending-icon">◷</span><p class="eyebrow">PEMBAYARAN TERKIRIM</p><h2 id="modalTitle">Menunggu Persetujuan Admin</h2><p>Bukti pembayaran kamu berhasil dikirim. Admin akan memeriksa bukti transfer sebelum membership diaktifkan.</p><div class="payment-summary"><span>Paket</span><strong>${esc(plan.name)}</strong><span>Total</span><strong>${money(plan.price)}</strong><span>Status</span><strong class="pending-text">Menunggu Persetujuan Admin</strong></div><p class="muted">Perkembangan status dapat dilihat melalui menu Akun → Riwayat Membership.</p><button class="btn btn-primary" id="goPaymentHistory" type="button">Lihat riwayat membership</button></div>`);
   $("#goPaymentHistory").onclick=accountPanel;toast("Bukti terkirim. Status: menunggu persetujuan admin.");
  }catch(error){
   await db.storage.from("payment-proofs").remove([path]).catch(()=>{});
   submitButton.disabled=false;submitButton.textContent="Kirim untuk verifikasi";
   toast("Pengiriman pembayaran gagal: "+(error?.message||"Coba lagi."));console.error("ASUPANMEME payment submission:",error);
  }
 };
}
async function uploadPanel(){
 const isAdmin=state.profile?.role==="admin";
 modal(`<div class="upload-dialog"><div class="upload-dialog-heading"><span class="upload-kicker">ASUPANMEME CREATOR STUDIO</span><h2 id="modalTitle">Upload video</h2><p>${isAdmin?"Terbitkan konten baru dan atur akses penayangannya.":"Kirim video untuk ditinjau admin sebelum ditayangkan."}</p></div><div class="upload-promo"><div class="upload-promo-mark">✦</div><div><strong>Bagikan konten berkualitas</strong><p>Unggah video gratis untuk komunitas. Kontributor yang aktif dan rutin berbagi berkesempatan mendapatkan penawaran akses eksklusif dari admin.</p><small>${isAdmin?"Video admin dapat langsung ditayangkan.":"Video akan diperiksa admin terlebih dahulu sebelum muncul di katalog."}</small></div></div><form class="form-stack upload-form" id="videoUploadForm"><div class="upload-section-label">INFORMASI VIDEO</div><div class="field"><label>Judul video</label><input name="title" required maxlength="120" placeholder="Judul video"></div><div class="field"><label>Deskripsi <span class="field-optional">OPSIONAL</span></label><textarea name="description" rows="3" maxlength="1000" placeholder="Deskripsi video (opsional)"></textarea></div><div class="field"><label>File video <span>MP4, WEBM, MOV · MAKS. 500 MB</span></label><input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" required></div><div class="field"><label>Thumbnail <span class="field-optional">OPSIONAL · JPG/PNG/WEBP · MAKS. 5 MB</span></label><input name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp"></div>${isAdmin?'<div class="field"><label>Akses video</label><select name="access"><option value="free">Gratis</option><option value="exclusive">Eksklusif</option></select></div>':'<div class="field"><label>Akses video</label><input value="Gratis (wajib)" disabled></div>'}<button class="btn btn-primary upload-submit" type="submit"><span>Upload video</span><span aria-hidden="true">↗</span></button></form></div>`);
 $("#videoUploadForm").onsubmit=async e=>{
  e.preventDefault();
  const form=e.currentTarget,f=new FormData(form),video=f.get("video"),thumb=f.get("thumbnail");
  if(!db){toast("Layanan upload belum terhubung.");return}
  const allowedTypes=["video/mp4","video/webm","video/quicktime"];
  if(!video||!allowedTypes.includes(video.type)||video.size>500*1024*1024){toast("Pilih video MP4, WEBM, atau MOV maksimal 500 MB.");return}
  if(thumb?.size>5*1024*1024){toast("Thumbnail maksimal 5 MB.");return}
  const btn=form.querySelector("button[type=submit]");
  btn.disabled=true;btn.textContent="Menyiapkan upload multipart...";
  let r2Key=null;
  let multipartUploadId=null;
  let multipartCompleted=false;
  let thumbnailPath=null;
  let uploadToken=null;
  let uploadOwner=state.user?.id||("public");
  const multipartRequest=async(payload)=>{
   const headers={"content-type":"application/json",...(uploadToken?{Authorization:"Bearer "+uploadToken}:{})};
   const response=await fetch("/api/r2-multipart",{method:"POST",headers,body:JSON.stringify(payload)});
   const result=await response.json().catch(()=>({error:"Respons server tidak valid."}));
   if(!response.ok)throw new Error(result.error||"Permintaan multipart upload gagal (HTTP "+response.status+").");
   return result;
  };
  try{
   const sessionResult=await db.auth.getSession();
   const sessionToken=sessionResult.data?.session?.access_token||null;
   const admin=state.profile?.role==="admin";
   // Community submissions always use the public/ review namespace, even when signed in.
   uploadToken=admin?sessionToken:null;
   const created=await multipartRequest({action:"create",filename:video.name,content_type:video.type,size:video.size});
   r2Key=created.key;
   multipartUploadId=created.uploadId;
   const partSize=10*1024*1024;
   const completedParts=[];
   // Upload up to three R2 parts concurrently to reduce total waiting time
   // while keeping memory/network usage bounded on mobile devices.
   let completedCount=0;
   const partResults=new Array(created.parts.length);
   let nextPartIndex=0;
   const uploadWorker=async()=>{
    while(true){
     const index=nextPartIndex++;
     if(index>=created.parts.length)return;
     const part=created.parts[index];
     const from=index*partSize;
     const chunk=video.slice(from,Math.min(from+partSize,video.size));
     const partResponse=await fetch(part.url,{method:"PUT",body:chunk});
     if(!partResponse.ok){
      const detail=await partResponse.text().catch(()=>"");
      throw new Error("Bagian "+(index+1)+" gagal diunggah (HTTP "+partResponse.status+"). "+detail.slice(0,220));
     }
     const etag=partResponse.headers.get("ETag");
     if(!etag)throw new Error("Dahono tidak mengirim header ETag untuk bagian "+(index+1)+". Bucket perlu mengizinkan expose header ETag pada CORS.");
     partResults[index]={PartNumber:part.partNumber,ETag:etag};
     completedCount++;
     btn.textContent="Mengunggah video "+Math.round(completedCount/created.parts.length*100)+"% ("+completedCount+"/"+created.parts.length+")";
    }
   };
   await Promise.all(Array.from({length:Math.min(3,created.parts.length)},()=>uploadWorker()));
   completedParts.push(...partResults);
   btn.textContent="Menyelesaikan upload...";
   await multipartRequest({action:"complete",key:r2Key,uploadId:multipartUploadId,parts:completedParts});
   multipartCompleted=true;
   multipartUploadId=null;
   let thumbnail_url=null;
   if(thumb?.size){
    const tExt=(thumb.name.split(".").pop()||"jpg").toLowerCase();
    thumbnailPath=(admin&&state.user?.id?state.user.id:"public")+"/thumb-"+crypto.randomUUID()+"."+tExt;
    const {error:tErr}=await db.storage.from("video-thumbnails").upload(thumbnailPath,thumb,{contentType:thumb.type,upsert:false});
    if(!tErr){const {data:pub}=db.storage.from("video-thumbnails").getPublicUrl(thumbnailPath);thumbnail_url=pub.publicUrl}
   }
   const access=admin&&f.get("access")==="exclusive";
   const {error:dbErr}=await db.from("videos").insert({
    title:String(f.get("title")).trim(),
    description:String(f.get("description")||"").trim(),
    storage_path:r2Key,
    storage_provider:"r2",
    thumbnail_url,
    is_exclusive:access,
    published:admin,
    uploader_id:state.user?.id||null
   });
   if(dbErr)throw new Error("Video sudah terunggah, tetapi data katalog gagal disimpan: "+dbErr.message);
   closeModal();toast(admin?"Berhasil menambahkan video. Video sudah ditayangkan.":"Berhasil menambahkan video. Kiriman menunggu persetujuan admin.");await loadVideos();
  }catch(error){
   if(multipartUploadId&&r2Key){
    try{await multipartRequest({action:"abort",key:r2Key,uploadId:multipartUploadId})}catch(abortError){console.error("ASUPANMEME multipart abort:",abortError)}
   }
   if(r2Key&&multipartCompleted&&uploadToken){
    try{await fetch("/api/r2-delete",{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+uploadToken},body:JSON.stringify({key:r2Key})})}catch(_){}
   }
   if(thumbnailPath)await db.storage.from("video-thumbnails").remove([thumbnailPath]).catch(()=>{});
   btn.disabled=false;btn.textContent="Kirim video";
   toast("Upload gagal: "+(error?.message||"Periksa konfigurasi Dahono dan CORS bucket."));
   console.error("ASUPANMEME Dahono multipart upload:",error);
  }
 };
}
async function adminVideosPanel(){if(state.profile?.role!=="admin"){toast("Akses admin ditolak.");return}let adminResult=await db.from("videos").select("id,title,is_exclusive,published,created_at,uploader_id,storage_path,storage_provider,video_url,description,thumbnail_url,duration,views").order("created_at",{ascending:false}).limit(100);if(adminResult.error?.code==="42703")adminResult=await db.from("videos").select("id,title,is_exclusive,published,created_at,uploader_id,storage_path").order("created_at",{ascending:false}).limit(100);const {data,error}=adminResult;if(error){toast(error.message);return}modal(`<p class="eyebrow">VIDEO CONTROL</p><h2 id="modalTitle">Kelola video</h2><p>Terbitkan kiriman komunitas, ubah akses, atau hapus video.</p><div class="admin-list">${(data||[]).map(v=>'<div class="admin-row"><div><b>'+esc(v.title)+'</b><small>'+(v.is_exclusive?'EKSKLUSIF':'GRATIS')+' · '+(v.published?'Tayang':'Menunggu persetujuan')+'</small><small>'+new Date(v.created_at).toLocaleString("id-ID")+'</small></div><div class="admin-actions">'+(!v.published?'<button data-preview-video="'+esc(v.id)+'">▶ Preview</button><button data-publish="'+esc(v.id)+'">Terbitkan gratis</button>':'')+'<button data-toggle="'+esc(v.id)+'">'+(v.is_exclusive?'Jadikan gratis':'Jadikan eksklusif')+'</button><button data-delete-video="'+esc(v.id)+'">Hapus</button></div></div>').join("")||'<p>Belum ada video.</p>'}</div><button class="btn btn-ghost" id="backAdminMain">Kembali ke dashboard</button>`);$("#backAdminMain").onclick=adminPanel;$$("[data-preview-video]").forEach(b=>b.onclick=()=>{const row=data.find(v=>v.id===b.dataset.previewVideo);if(row)openVideo(row.id,row,true)});$$("[data-publish]").forEach(b=>b.onclick=async()=>{const {error}=await db.from("videos").update({published:true}).eq("id",b.dataset.publish);if(error){toast(error.message);return}toast("Video diterbitkan sebagai Gratis.");adminVideosPanel();loadVideos()});$$("[data-toggle]").forEach(b=>b.onclick=async()=>{const row=data.find(v=>v.id===b.dataset.toggle);const {error}=await db.from("videos").update({is_exclusive:!row.is_exclusive,published:true}).eq("id",row.id);if(error){toast(error.message);return}toast("Akses video diperbarui.");adminVideosPanel();loadVideos()});$$("[data-delete-video]").forEach(b=>b.onclick=async()=>{const row=data.find(v=>v.id===b.dataset.deleteVideo);if(!confirm("Hapus video ini secara permanen?"))return;if(row.storage_path){if(row.storage_provider==="r2"){const {data:{session}}=await db.auth.getSession();const response=await fetch("/api/r2-delete",{method:"POST",headers:{"content-type":"application/json",...(session?.access_token?{Authorization:"Bearer "+session.access_token}:{})},body:JSON.stringify({key:row.storage_path})});const result=await response.json();if(!response.ok){toast("Gagal menghapus file R2: "+(result.error||"Kesalahan server"));return}}else{const {error:storageError}=await db.storage.from("media-videos").remove([row.storage_path]);if(storageError){toast("Gagal menghapus file Supabase: "+storageError.message);return}}}const {error}=await db.from("videos").delete().eq("id",row.id);if(error){toast(error.message);return}toast("Video dihapus.");adminVideosPanel();loadVideos()})}
async function adminPanel(){
 if(state.profile?.role!=="admin"){toast("Akses admin ditolak. Pastikan role akun adalah admin.");return}
 if(!db){toast("Koneksi database belum tersedia.");return}
 protectDashboardBack();
 const [{data,error},{data:setting}]=await Promise.all([
  db.from("payment_submissions").select("*").order("created_at",{ascending:false}),
  db.from("site_settings").select("key,value").eq("key","qris_image_url").maybeSingle()
 ]);
 if(error){toast("Gagal memuat pembayaran: "+error.message);return}
 const qrisUrl=setting?.value||"";
 modal(`<p class="eyebrow">ADMIN CONTROL CENTER</p><h2 id="modalTitle">Dashboard admin</h2><p>Kelola konten, QRIS, dan verifikasi pembayaran ASUPANMEME.</p><div class="form-stack admin-tools" style="margin:18px 0 24px"><button class="btn btn-primary" id="manageVideos" type="button">▶ Kelola semua video</button><button class="btn btn-ghost" id="uploadAdminVideo" type="button">＋ Upload video baru</button></div><section class="admin-qris"><p class="eyebrow">PAYMENT SETTINGS</p><h3>QRIS pembayaran</h3>${qrisUrl?'<img class="admin-qris-preview" src="'+esc(qrisUrl)+'" alt="QRIS aktif">':'<p class="muted">Belum ada gambar QRIS yang diunggah.</p>'}<form id="qrisUploadForm" class="form-stack"><div class="field"><label>Unggah gambar QRIS (JPG, PNG, WEBP maks. 5 MB)</label><input name="qris" type="file" accept="image/jpeg,image/png,image/webp" required></div><button class="btn btn-primary" type="submit">Simpan QRIS</button></form><small>QRIS ini akan ditampilkan di halaman membership untuk semua pengguna.</small></section><div class="admin-payment-section" style="border-top:1px solid #37313b;padding-top:18px"><p class="eyebrow">MEMBERSHIP</p><h3 style="font-size:16px;margin:0 0 6px">Verifikasi pembayaran</h3><p>Periksa bukti pembayaran sebelum mengaktifkan membership pengguna.</p><div class="admin-list">${(data||[]).map(x=>'<div class="admin-row"><div><b>'+esc(x.plan_name)+' · '+money(x.amount)+'</b><small>'+esc(x.sender_name)+' · '+esc(x.payment_method)+' · '+esc(x.status)+'</small><small>'+new Date(x.created_at).toLocaleString("id-ID")+'</small><button class="inline-link" data-proof="'+esc(x.id)+'">Lihat bukti</button></div><div class="admin-actions">'+(x.status==="pending"?'<button data-approve="'+esc(x.id)+'">Setujui</button><button data-reject="'+esc(x.id)+'">Tolak</button>':"")+'</div></div>').join("")||'<p>Belum ada pembayaran masuk.</p>'}</div><p class="muted">Persetujuan memanggil database function yang memvalidasi hak admin dan mengaktifkan masa membership.</p></div>`);
 $("#manageVideos").onclick=adminVideosPanel;$("#uploadAdminVideo").onclick=uploadPanel;
 $("#qrisUploadForm").onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,file=new FormData(form).get("qris"),button=form.querySelector('button[type="submit"]');
  if(!file||file.size>5*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type)){toast("Pilih gambar QRIS JPG, PNG, atau WEBP maksimal 5 MB.");return}
  button.disabled=true;button.textContent="Menyimpan QRIS...";
  const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg",path="admin/qris-"+crypto.randomUUID()+"."+ext;
  try{
   const {error:uploadError}=await db.storage.from("payment-qris").upload(path,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;
   const {data:publicData}=db.storage.from("payment-qris").getPublicUrl(path);
   const {error:settingError}=await db.from("site_settings").upsert({key:"qris_image_url",value:publicData.publicUrl});
   if(settingError){await db.storage.from("payment-qris").remove([path]);throw settingError}
   toast("QRIS berhasil disimpan dan ditampilkan di halaman membership.");await adminPanel();
  }catch(uploadError){button.disabled=false;button.textContent="Simpan QRIS";toast("Gagal menyimpan QRIS: "+(uploadError?.message||"Periksa konfigurasi Supabase."));console.error("ASUPANMEME QRIS upload:",uploadError)}
 };
 $$("[data-proof]").forEach(b=>b.onclick=async()=>{
  const row=data.find(x=>x.id===b.dataset.proof),{data:file,error}=await db.storage.from("payment-proofs").createSignedUrl(row.proof_path,90);
  if(error){toast(error.message);return}
  modal(`<h2 id="modalTitle">Bukti pembayaran</h2><img src="${esc(file.signedUrl)}" style="width:100%;border-radius:12px;margin-top:18px" alt="Bukti transfer"><button class="btn btn-ghost" id="backAdmin" style="margin-top:15px">Kembali</button>`);$("#backAdmin").onclick=adminPanel;
 });
 $$("[data-approve]").forEach(b=>b.onclick=()=>reviewPayment(b.dataset.approve,true));
 $$("[data-reject]").forEach(b=>b.onclick=()=>reviewPayment(b.dataset.reject,false));
}
async function reviewPayment(id,approve){const note=approve?"Pembayaran diverifikasi":"Bukti pembayaran ditolak";const {error}=await db.rpc("review_payment",{submission_id:id,approve_payment:approve,admin_note:note});if(error){toast("Gagal memproses: "+error.message);return}toast(approve?"Pembayaran disetujui. Membership diaktifkan.":"Pembayaran ditolak.");adminPanel();loadProfile()}
function nav(view){state.view=view;state.page=1;$$("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));closeSidebar();renderVideos();document.querySelector(".section-heading.section-spaced")?.scrollIntoView({behavior:"smooth",block:"start"})}
document.addEventListener("click",e=>{const v=e.target.closest("[data-view]");if(v)nav(v.dataset.view);const a=e.target.closest("[data-action]");if(a){if(a.dataset.action==="account")openAccount();if(a.dataset.action==="transactions")transactionHistoryPanel();if(a.dataset.action==="membership")membershipPanel();if(a.dataset.action==="upload")uploadPanel()}});
$$("[data-filter]").forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;state.page=1;$$("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));renderVideos()});
$("#searchInput").oninput=e=>{state.search=e.target.value.trim().toLowerCase();state.page=1;renderVideos()};
$("#sortSelect").onchange=e=>{state.videos.sort((a,b)=>e.target.value==="popular"?(b.views||0)-(a.views||0):e.target.value==="az"?a.title.localeCompare(b.title):new Date(b.created_at)-new Date(a.created_at));state.page=1;renderVideos()};
const sidebar=$("#sidebar"),sidebarOverlay=$("#sidebarOverlay");
document.addEventListener("click",event=>{
 const p=event.target.closest("[data-page]");
 if(p&&!p.disabled){state.page=Number(p.dataset.page)||1;renderVideos();return}
 const rp=event.target.closest("[data-rec-page]");
 if(rp&&!rp.disabled){
  const section=$("#playerRecommendations");
  const currentId=section?.dataset.currentVideoId;
  if(currentId){state.recommendationPage=Number(rp.dataset.recPage)||1;renderRecommendations(currentId)}
  return;
 }
 const rec=event.target.closest("[data-recommendation-video]");
 if(rec){event.preventDefault();openVideo(rec.dataset.recommendationVideo);return}
});
function closeSidebar(){sidebar.classList.remove("open");sidebarOverlay.classList.remove("visible");document.body.classList.remove("sidebar-open")}
function toggleSidebar(){
 const opening=!sidebar.classList.contains("open");
 sidebar.classList.toggle("open",opening);
 sidebarOverlay.classList.toggle("visible",opening);
 document.body.classList.toggle("sidebar-open",opening);
}

document.addEventListener("click",event=>{
 const target=event.target;if(!(target instanceof Element))return;
 const accessButton=target.closest("[data-access-check]");
  if(accessButton){event.preventDefault();event.stopPropagation();openVideo(accessButton.dataset.accessCheck);return}
  const saveButton=target.closest("[data-save]");
 if(saveButton){event.preventDefault();event.stopPropagation();const id=saveButton.dataset.save;state.saved.has(id)?state.saved.delete(id):state.saved.add(id);try{localStorage.setItem("asm_saved",JSON.stringify([...state.saved]))}catch(_){}renderVideos();return}
 const videoCard=target.closest(".video-card[data-video]");
 if(videoCard&&!target.closest("button,a,input,select,textarea"))openVideo(videoCard.dataset.video);
});
document.addEventListener("keydown",event=>{
 if((event.key==="Enter"||event.key===" ")&&event.target instanceof Element&&event.target.matches(".video-card[role=button]")){event.preventDefault();openVideo(event.target.dataset.video)}
});
$("#modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")closeModal()};
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModal();closeSidebar()}});

// Age-gate clicks are handled by the early delegated listener above.
try{if(sessionStorage.getItem("asm_age_confirmed")==="yes")$("#ageGate").classList.add("hidden")}catch(_){}
$("#year").textContent=$("#footerYear").textContent=new Date().getFullYear();
async function init(){if(db){const {data}=await db.auth.getSession();state.user=data.session?.user||null;if(state.user)await loadProfile();db.auth.onAuthStateChange(async(_event,session)=>{state.user=session?.user||null;if(state.user)await loadProfile();else state.profile=null;refreshAuth();await loadVideos()})}refreshAuth();await loadVideos();if(!configured)toast("Mode demo: isi config.js dan jalankan supabase/schema.sql untuk mengaktifkan akun & pembayaran.")}init();
})();
/* ASUPANMEME production asset refresh: 2026-11-12 — source aligned with latest GitHub features. */
