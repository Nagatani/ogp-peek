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

      // Bufferとして取得
      const buffer = await response.arrayBuffer();

      // エンコーディングを検出
      let encoding = 'utf-8';
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('charset=')) {
        encoding = contentType.split('charset=')[1].split(';')[0].trim();
      } else {
        // ヘッダーにない場合、HTML内のmetaタグを探す (最初の1024バイト程度を確認)
        const partial = new TextDecoder('utf-8').decode(buffer.slice(0, 1024));
        const metaCharset = partial.match(/<meta\s+charset=["']?([\w-]+)["']?/i);
        const metaContentType = partial.match(/<meta\s+http-equiv=["']Content-Type["']\s+content=["'].*charset=([\w-]+)["']/i);

        if (metaCharset) {
          encoding = metaCharset[1];
        } else if (metaContentType) {
          encoding = metaContentType[1];
        }
      }

      // デコード
      try {
        const decoder = new TextDecoder(encoding);
        html = decoder.decode(buffer);
      } catch (e) {
        console.warn(`Failed to decode with ${encoding}, falling back to utf-8`);
        const decoder = new TextDecoder('utf-8');
        html = decoder.decode(buffer);
      }

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