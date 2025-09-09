// r2-upload-worker.js

// GitHubリポジトリの情報
const GITHUB_REPO_OWNER = 'str5150';
const GITHUB_REPO_NAME = 'radio-app';
const GITHUB_FILE_PATH = 'episodes.json';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${GITHUB_FILE_PATH}`;

// web-pushライブラリのインポート (Wranglerが自動で解決)
import webpush from 'web-push';


export default {
  async fetch(request, env, ctx) {
    // CORSプリフライトリクエストへの対応
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // 環境変数チェック
    if (!env.RADIO_APP_BUCKET || !env.SUBSCRIPTIONS_KV || !env.VAPID_PRIVATE_KEY || !env.GITHUB_TOKEN) {
      return new Response('Required environment variables are not configured.', { status: 500 });
    }

    const action = request.headers.get('X-Action');

    switch (request.method) {
      case 'GET':
        return await handleGetRequest(request, env); // ファイル一覧取得
      
      case 'PUT':
        return await handlePutRequest(request, env); // episodes.json更新
      
      case 'POST':
        if (action === 'subscribe') {
          return await handleSubscription(request, env); // 購読情報保存
        }
        if (action === 'notify') {
          return await handleNotification(request, env); // 通知送信
        }
        // actionがなければ通常のファイルアップロード
        return await handlePostRequest(request, env);
      
      default:
        return new Response('Method Not Allowed', { status: 405 });
    }
  },
};

/**
 * POSTリクエストを処理してファイルをアップロードする
 */
async function handlePostRequest(request, env) {
  try {
    const filename = request.headers.get('X-Custom-Filename');
    if (!filename || !filename.match(/^[\w\-.]+\.mp3$/)) {
      return new Response('Valid filename header (X-Custom-Filename) is required.', { status: 400 });
    }

    const object = await env.RADIO_APP_BUCKET.put(filename, request.body, {
      httpMetadata: {
        contentType: 'audio/mpeg',
      },
    });

    return new Response(JSON.stringify({
      message: 'File uploaded successfully!',
      filename: object.key,
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (e) {
    return new Response(e.message || 'An error occurred', { status: 500 });
  }
}

/**
 * GETリクエストを処理してファイル一覧を取得する
 */
async function handleGetRequest(request, env) {
  try {
    const listResult = await env.RADIO_APP_BUCKET.list();
    const files = listResult.objects.map(obj => ({
      key: obj.key,
      uploaded: obj.uploaded,
      size: obj.size,
    }));

    // アップロードが新しい順にソート
    files.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

    return new Response(JSON.stringify(files), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (e) {
    return new Response(e.message || 'An error occurred', { status: 500 });
  }
}

/**
 * PUTリクエストを処理してepisodes.jsonを更新する
 */
async function handlePutRequest(request, env) {
  if (!env.GITHUB_TOKEN) {
    return new Response('GitHub token is not configured.', { status: 500 });
  }
  
  try {
    const newEpisode = await request.json();

    // 1. 現在のepisodes.jsonを取得
    const fileResponse = await fetch(GITHUB_API_URL, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Worker-Radio-App',
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch episodes.json: ${fileResponse.statusText}`);
    }

    const fileData = await fileResponse.json();
    const currentContent = JSON.parse(atob(fileData.content));
    const currentSha = fileData.sha;

    // 2. 新しいエピソードを追加
    currentContent.episodes.unshift(newEpisode); // 配列の先頭に追加

    // 3. 更新した内容でGitHubにプッシュ
    const updatedContent = JSON.stringify(currentContent, null, 2);
    const updateResponse = await fetch(GITHUB_API_URL, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Worker-Radio-App',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Create new episode: ${newEpisode.title}`,
        content: btoa(updatedContent),
        sha: currentSha,
        branch: 'main', // or your default branch
      }),
    });

    if (!updateResponse.ok) {
        const errorBody = await updateResponse.text();
        throw new Error(`Failed to update episodes.json: ${updateResponse.statusText} - ${errorBody}`);
    }

    return new Response(JSON.stringify({ message: 'Episode created successfully!' }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}

/**
 * 購読情報をKVに保存する
 */
async function handleSubscription(request, env) {
  try {
    const subscription = await request.json();
    // endpointをキーとして保存（ユニークなため）
    await env.SUBSCRIPTIONS_KV.put(subscription.endpoint, JSON.stringify(subscription));
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders }});
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}

/**
 * 全購読者にプッシュ通知を送信する
 */
async function handleNotification(request, env) {
    const { episodeId } = await request.json();
    if (!episodeId) {
        return new Response('Episode ID is required.', { status: 400 });
    }

    // TODO: episodes.jsonから該当エピソードの情報を取得する
    // この実装は簡略化のため、ダミーデータを使用
    const episode = {
        title: "新しいエピソードが公開されました！",
        description: `ID: ${episodeId} のエピソードを今すぐチェック！`,
    };

    const notificationPayload = JSON.stringify({
        title: episode.title,
        body: episode.description,
        icon: './icons/icon-192x192.png',
        data: {
            url: `https://str5150.github.io/radio-app/#${episodeId}`, // クリック時の遷移先
        },
    });

    webpush.setVapidDetails(
        'mailto:satoru.slash5150@gmail.com',
        'BDklodHnx0KIqk9nWoxo3J_MXOUqW-C0wliaxCK4ZIKMDFP7PL6PFG2qIxxlDFofcfH6Q4ogOL_mEtNgCStMBnM', // Public Key
        env.VAPID_PRIVATE_KEY
    );

    const subscriptions = [];
    const kvList = await env.SUBSCRIPTIONS_KV.list();
    for (const key of kvList.keys) {
        const subString = await env.SUBSCRIPTIONS_KV.get(key.name);
        subscriptions.push(JSON.parse(subString));
    }
    
    let successCount = 0;
    let errorCount = 0;

    const sendPromises = subscriptions.map(sub => 
        webpush.sendNotification(sub, notificationPayload)
            .then(() => successCount++)
            .catch(err => {
                console.error("Failed to send notification, sub:", sub.endpoint, "error:", err);
                // 期限切れの購読情報などを削除するロジックをここに追加できる
                if (err.statusCode === 410) {
                   // env.SUBSCRIPTIONS_KV.delete(...)
                }
                errorCount++;
            })
    );

    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ success: true, successCount, errorCount }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
}


// 共通のCORSヘッダー (X-Actionを追加)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Custom-Filename, X-Action',
};

/**
 * CORSプリフライトリクエストを処理する
 */
function handleOptions(request) {
  if (
    request.headers.get('Origin') !== null &&
    request.headers.get('Access-Control-Request-Method') !== null &&
    request.headers.get('Access-Control-Request-Headers') !== null
  ) {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        'Access-Control-Max-Age': '86400', // 24時間
      },
    });
  } else {
    return new Response(null, {
      headers: {
        Allow: 'GET, POST, PUT, OPTIONS',
      },
    });
  }
}
