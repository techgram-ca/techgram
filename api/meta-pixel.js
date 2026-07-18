// Serves the Meta Pixel base code with the Pixel ID injected from the
// META_PIXEL_ID environment variable. Loaded from index.html via
// <script src="/api/meta-pixel"></script>. If the env var is not set,
// it responds with a harmless no-op so the site keeps working.
export default function handler(req, res) {
  const pixelId = process.env.META_PIXEL_ID;

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");

  if (!pixelId) {
    return res.status(200).send("/* META_PIXEL_ID is not set — Meta Pixel disabled */");
  }

  const script = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(pixelId)});
fbq('track', 'PageView');`;

  return res.status(200).send(script);
}
