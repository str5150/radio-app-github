// r2-upload-worker.js

// GitHubリポジトリの情報
const GITHUB_REPO_OWNER = 'str5150';
const GITHUB_REPO_NAME = 'radio-app-github';
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
    console.log('Request method:', request.method);
    console.log('X-Action header:', action);
    console.log('All headers:', Object.fromEntries(request.headers.entries()));

    switch (request.method) {
      case 'GET':
        return await handleGetRequest(request, env); // ファイル一覧取得
      
      case 'PUT':
        console.log('PUT request received, action:', action);
        if (action === 'update_episodes') {
          console.log('Routing to handleUpdateEpisodesRequest');
          return await handleUpdateEpisodesRequest(request, env); // エピソード一覧更新
        }
        console.log('Routing to handlePutRequest');
        return await handlePutRequest(request, env); // episodes.json更新
      
      case 'POST':
        console.log('POST request received, action:', action);
        if (action === 'subscribe') {
          console.log('Routing to handleSubscription');
          return await handleSubscription(request, env); // 購読情報保存
        }
        if (action === 'notify') {
          console.log('Routing to handleNotification');
          return await handleNotification(request, env); // 通知送信
        }
        if (action === 'update_episode') {
          console.log('Routing to handleUpdateEpisodeRequest');
          return await handleUpdateEpisodeRequest(request, env); // エピソード更新
        }
        if (action === 'update_episodes') {
          console.log('Routing to handleUpdateEpisodesRequest');
          return await handleUpdateEpisodesRequest(request, env); // エピソード一覧更新（削除用）
        }
        if (action === 'track_play') {
          console.log('Routing to handleTrackPlayRequest');
          return await handleTrackPlayRequest(request, env); // 再生数を記録
        }
        if (action === 'delete_comment') {
          console.log('Routing to handleDeleteCommentRequest');
          return await handleDeleteCommentRequest(request, env); // コメント削除
        }
        // actionがなければ通常のファイルアップロード
        console.log('Routing to handlePostRequest (file upload)');
        return await handlePostRequest(request, env);
      
      default:
        console.log('Unhandled method:', request.method);
        return new Response('Method Not Allowed', { status: 405 });
    }
  },
};

/**
 * POSTリクエストを処理してファイルをアップロードする
 */
async function handlePostRequest(request, env) {
  console.log('handlePostRequest called');
  try {
    const filename = request.headers.get('X-Custom-Filename');
    console.log('Filename from header:', filename);
    
    if (!filename || !filename.match(/^[a-zA-Z0-9\-.]+\.mp3$/i)) {
      console.error('Invalid filename:', filename);
      return new Response(JSON.stringify({ success: false, error: 'Valid filename header (X-Custom-Filename) is required.' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Starting R2 upload for:', filename);
    const object = await env.RADIO_APP_BUCKET.put(filename, request.body, {
      httpMetadata: {
        contentType: 'audio/mpeg',
      },
    });
    console.log('R2 upload successful:', object.key, 'size:', object.size);

    return new Response(JSON.stringify({
      success: true,
      key: object.key,
      size: object.size
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (e) {
    console.error('R2 Upload Error:', e);
    return new Response(JSON.stringify({ success: false, error: e.message || 'An unknown error occurred during upload.' }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
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
    console.error('R2 List Error:', e);
    return new Response(JSON.stringify({ success: false, error: e.message || 'An unknown error occurred while listing files.' }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POSTリクエストを処理して再生数を記録する
 */
async function handleTrackPlayRequest(request, env) {
    if (!env.GITHUB_TOKEN) {
        return new Response(JSON.stringify({ success: false, error: 'GitHub token is not configured.' }), { status: 500 });
    }

    try {
        const { episodeId } = await request.json();
        if (!episodeId) {
            return new Response(JSON.stringify({ success: false, error: 'Episode ID is required.' }), { status: 400 });
        }

        // 1. 現在のepisodes.jsonを取得
        const fileResponse = await fetch(GITHUB_API_URL, {
            headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker-Radio-App' }
        });
        if (!fileResponse.ok) throw new Error('Failed to fetch episodes.json');

        const fileData = await fileResponse.json();
        const currentContent = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));
        const currentSha = fileData.sha;

        // 2. 該当のエピソードを探してplayCountをインクリメント
        const episodeIndex = currentContent.episodes.findIndex(ep => ep.id === episodeId);
        if (episodeIndex === -1) {
            // エピソードが見つからなくてもエラーにはせず、記録しないだけにする
            console.log(`Track play: Episode ID ${episodeId} not found.`);
            return new Response(JSON.stringify({ success: true, message: 'Episode not found, but acknowledged.' }), { status: 200 });
        }
        
        const episode = currentContent.episodes[episodeIndex];
        episode.playCount = (episode.playCount || 0) + 1;

        // 3. 更新した内容でGitHubにプッシュ
        const updatedContent = JSON.stringify(currentContent, null, 2);
        const updateResponse = await fetch(GITHUB_API_URL, {
            method: 'PUT',
            headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker-Radio-App', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `chore: Increment play count for ${episodeId}`,
                content: Buffer.from(updatedContent, 'utf8').toString('base64'),
                sha: currentSha,
                branch: 'main',
            }),
        });

        if (!updateResponse.ok) {
            throw new Error(`Failed to update play count: ${updateResponse.statusText}`);
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });

    } catch (e) {
        console.error('Track Play Error:', e);
        // このAPIはバックグラウンドで呼ばれるため、エラーレスポンスはシンプルにする
        return new Response(JSON.stringify({ success: false }), { status: 500 });
    }
}


/**
 * POSTリクエストを処理して特定のエピソードを更新する
 */
async function handleUpdateEpisodeRequest(request, env) {
    if (!env.GITHUB_TOKEN) {
        return new Response(JSON.stringify({ success: false, error: 'GitHub token is not configured.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    try {
        const updatedEpisodeData = await request.json();

        // 1. 現在のepisodes.jsonを取得
        const fileResponse = await fetch(GITHUB_API_URL, {
            headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker-Radio-App' }
        });

        if (!fileResponse.ok) {
            throw new Error(`Failed to fetch episodes.json: ${fileResponse.statusText}`);
        }

        const fileData = await fileResponse.json();
        const currentContent = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));
        const currentSha = fileData.sha;

        // 2. 該当のエピソードを検索して更新
        const episodeIndex = currentContent.episodes.findIndex(ep => ep.id === updatedEpisodeData.id);
        if (episodeIndex === -1) {
            return new Response(JSON.stringify({ success: false, error: 'Episode not found.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
        }
        
        // 既存のデータを保持しつつ、新しいデータで上書き
        currentContent.episodes[episodeIndex] = { ...currentContent.episodes[episodeIndex], ...updatedEpisodeData };

        // 3. 更新した内容でGitHubにプッシュ
        const updatedContent = JSON.stringify(currentContent, null, 2);
        const updateResponse = await fetch(GITHUB_API_URL, {
            method: 'PUT',
            headers: { 'Authorization': `token ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker-Radio-App', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Update episode: ${updatedEpisodeData.title}`,
                content: Buffer.from(updatedContent, 'utf8').toString('base64'),
                sha: currentSha,
                branch: 'main',
            }),
        });

        if (!updateResponse.ok) {
            const errorBody = await updateResponse.text();
            throw new Error(`Failed to update episodes.json: ${updateResponse.statusText} - ${errorBody}`);
        }

        return new Response(JSON.stringify({ success: true, message: 'Episode updated successfully!' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (e) {
        console.error('Update Episode Error:', e);
        return new Response(JSON.stringify({ success: false, error: e.message }), { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
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
    const currentContent = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));
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
        content: Buffer.from(updatedContent, 'utf8').toString('base64'),
        sha: currentSha,
        branch: 'main', // or your default branch
      }),
    });

    if (!updateResponse.ok) {
        const errorBody = await updateResponse.text();
        throw new Error(`Failed to update episodes.json: ${updateResponse.statusText} - ${errorBody}`);
    }

    return new Response(JSON.stringify({ message: 'Episode created successfully!' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (e) {
    console.error('GitHub PUT Error:', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
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
    console.error('Subscription Error:', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
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

/**
 * コメント削除リクエストを処理する
 */
async function handleDeleteCommentRequest(request, env) {
  console.log('handleDeleteCommentRequest called');
  
  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ success: false, error: 'GitHub token is not configured.' }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { episodeId, commentId, userId } = await request.json();
    console.log('Delete comment request:', { episodeId, commentId, userId });

    // 1. 現在のepisodes.jsonを取得
    const fileResponse = await fetch(GITHUB_API_URL, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Radio-App-Worker'
      }
    });

    if (!fileResponse.ok) {
      throw new Error('Failed to fetch episodes.json');
    }

    const fileData = await fileResponse.json();
    const currentContent = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));

    // 2. 該当のエピソードを検索
    const episodeIndex = currentContent.episodes.findIndex(ep => ep.id === episodeId);
    if (episodeIndex === -1) {
      return new Response(JSON.stringify({ success: false, error: 'Episode not found.' }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. コメントを検索して削除
    const episode = currentContent.episodes[episodeIndex];
    const commentIndex = episode.comments.findIndex(comment => comment.id === commentId);
    
    if (commentIndex === -1) {
      return new Response(JSON.stringify({ success: false, error: 'Comment not found.' }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. ユーザーIDチェック（管理者でない場合）
    const comment = episode.comments[commentIndex];
    if (userId && comment.userId !== userId) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized to delete this comment.' }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5. コメントを削除
    episode.comments.splice(commentIndex, 1);

    // 6. GitHubに更新を送信
    const updatedContent = JSON.stringify(currentContent, null, 2);
    const updateResponse = await fetch(GITHUB_API_URL, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Radio-App-Worker'
      },
      body: JSON.stringify({
        message: `Delete comment from episode: ${episodeId}`,
        content: Buffer.from(updatedContent, 'utf8').toString('base64'),
        sha: fileData.sha
      })
    });

    if (!updateResponse.ok) {
      throw new Error('Failed to update episodes.json');
    }

    return new Response(JSON.stringify({ success: true, message: 'Comment deleted successfully!' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Delete Comment Error:', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * エピソード一覧更新リクエストを処理する（削除用）
 */
async function handleUpdateEpisodesRequest(request, env) {
  console.log('handleUpdateEpisodesRequest called');
  
  if (!env.GITHUB_TOKEN) {
    console.error('GitHub token is not configured');
    return new Response(JSON.stringify({ success: false, error: 'GitHub token is not configured.' }), { 
      status: 500,
      headers: corsHeaders 
    });
  }
  
  try {
    console.log('Parsing request JSON...');
    const updateData = await request.json();
    console.log('Request data:', updateData);
    
    const { episodes } = updateData;

    if (!episodes || !Array.isArray(episodes)) {
      throw new Error('Invalid episodes data');
    }

    console.log(`Updating episodes list with ${episodes.length} episodes`);

    // 1. 現在のepisodes.jsonを取得
    console.log('Fetching current episodes.json...');
    const fileResponse = await fetch(GITHUB_API_URL, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Radio-App-Worker'
      }
    });

    if (!fileResponse.ok) {
      const errorText = await fileResponse.text();
      console.error('Failed to fetch episodes.json:', fileResponse.status, errorText);
      throw new Error(`Failed to fetch episodes.json: ${fileResponse.status} ${fileResponse.statusText} - ${errorText}`);
    }

    const fileData = await fileResponse.json();
    console.log('Current file data received');
    
    const currentContent = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));
    console.log('Current content parsed, episodes count:', currentContent.episodes.length);

    // 2. エピソード一覧を更新
    currentContent.episodes = episodes;
    console.log('Updated content prepared');

    // 3. GitHubに更新をプッシュ
    console.log('Pushing update to GitHub...');
    const updateResponse = await fetch(GITHUB_API_URL, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Radio-App-Worker'
      },
      body: JSON.stringify({
        message: `Update episodes list (${episodes.length} episodes)`,
        content: Buffer.from(JSON.stringify(currentContent, null, 2), 'utf8').toString('base64'),
        sha: fileData.sha
      })
    });

    if (!updateResponse.ok) {
      const errorData = await updateResponse.text();
      console.error('Failed to update GitHub:', updateResponse.status, errorData);
      throw new Error(`Failed to update GitHub: ${updateResponse.status} ${updateResponse.statusText} - ${errorData}`);
    }

    console.log('Update successful');
    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Update episodes error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
