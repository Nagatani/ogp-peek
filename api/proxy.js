export default async function handler(req, res) {
  const { url } = req.query;

  // URLパラメータのチェック
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // セキュリティチェック (自ドメイン以外からのアクセスを拒否)
  const myHost = req.headers.host;
  const referer = req.headers.referer;

  // localhost (開発環境) は許可、それ以外はRefererチェック
  const isLocal = myHost && (myHost.includes('localhost') || myHost.includes('127.0.0.1'));

  // Refererが空、または自分のホストを含まない場合は拒否
  if (!isLocal && (!referer || !referer.includes(myHost))) {
    return res.status(403).json({ error: 'Forbidden: External access denied' });
  }

  try {
    let targetUrl = url;
    let response;
    let html;
    let redirectCount = 0;
    const maxRedirects = 5;

    while (redirectCount < maxRedirects) {
      // ターゲットURLのHTMLを取得
      response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }

      html = await response.text();

      // meta refreshチェック
      // <meta http-equiv="refresh" content="0;URL=https://example.com" />
      const metaRefreshMatch = html.match(/<meta\s+http-equiv=["']refresh["']\s+content=["']\d+;\s*URL=([^"']+)["']/i);

      if (metaRefreshMatch) {
        let redirectUrl = metaRefreshMatch[1];
        // 相対パスの場合は絶対パスに変換
        redirectUrl = new URL(redirectUrl, response.url).href;

        console.log(`Following meta refresh to: ${redirectUrl}`);
        targetUrl = redirectUrl;
        redirectCount++;
        continue;
      }

      // リダイレクトがなければループ終了
      break;
    }

    if (redirectCount >= maxRedirects) {
      console.warn('Max redirects reached');
    }

    // 結果をJSONで返す (HTML文字列と最終的なURLを含む)
    res.status(200).json({ contents: html, finalUrl: response.url });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}