import { createClient } from "@supabase/supabase-js";
const url=process.env.SUPABASE_URL, anon=process.env.SUPABASE_ANON_KEY, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin=url&&service?createClient(url,service,{auth:{persistSession:false}}):null;
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!admin||!anon)return res.status(500).json({error:"Server configuration incomplete"});
 const token=(req.headers.authorization||"").replace(/^Bearer\\s+/i,"");
 try{
  let user=null;
  if(token){
   const auth=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+token}});
   if(!auth.ok)return res.status(401).json({error:"Invalid session"});
   user=await auth.json();
  }
  const {video_id}=req.body||{};
  if(!video_id)return res.status(400).json({error:"video_id required"});
  const {data:v,error}=await admin.from("videos").select("id,is_exclusive,published,storage_path").eq("id",video_id).maybeSingle();
  if(error||!v||!v.published||!v.storage_path)return res.status(404).json({error:"Video unavailable"});
  if(v.is_exclusive){
   if(!user)return res.status(401).json({error:"Login required for exclusive videos"});
   const {data:p}=await admin.from("profiles").select("subscription_status,subscription_expires_at").eq("id",user.id).maybeSingle();
   if(!p||p.subscription_status!=="active"||!p.subscription_expires_at||new Date(p.subscription_expires_at)<=new Date())return res.status(403).json({error:"Premium membership required"});
  }
  const {data:signed,error:signError}=await admin.storage.from("media-videos").createSignedUrl(v.storage_path,90);
  if(signError)throw signError;
  return res.status(200).json({url:signed.signedUrl});
 }catch(e){return res.status(500).json({error:e.message||"Playback failed"});}
}
