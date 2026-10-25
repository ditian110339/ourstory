// ─────────────────────────────────────────────────────────────
//  这里是你唯一需要改的文件
// ─────────────────────────────────────────────────────────────

window.OURSTORY_CONFIG = {

  // 在一起的那一天
  startDate: '2024-07-21',

  // 你们怎么称呼（留空就不显示名字，页面只用"我们"）
  me: '',
  you: '',

  // 站点的名字，显示在手机桌面的图标下面
  siteName: '我们',

  // 家里那只猫叫什么
  petName: '团子',

  // ── 存储方式 ───────────────────────────────────────────────
  // 'local'  照片只存在当前这台手机的浏览器里，别人看不到，适合先试用
  // 'cloud'  照片存到云端，两台手机看到的是同一份，正式使用要选这个
  mode: 'cloud',

  // 本地模式下的进入口令；留空则打开就直接进
  passcode: '',

  // 云端模式要填的三样，注册 Supabase 之后才有，详见「上线步骤.md」
  supabase: {
    url: 'https://lkswlaeufdmhxcylsdaa.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrc3dsYWV1ZmRtaHhjeWxzZGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MTgyMDQsImV4cCI6MjEwODQ5NDIwNH0.7fPee76qL2u1Gizlq4KPTi4-NAdLV5H0WPP3LLl_xmI',
    email: 'us@ourstory.app'
  }

};
