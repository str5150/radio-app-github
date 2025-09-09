# Cloudflare Worker & R2 デプロイガイド

このガイドでは、作成したCloudflare Workerをデプロイし、R2バケットと連携させて音声ファイルアップロード機能を完成させる手順を説明します。

## 🎯 目的

-   ローカルの `r2-upload-worker.js` スクリプトをCloudflareにデプロイする。
-   デプロイしたWorkerに、R2バケットへのアクセス権限を与える。
-   GitHub Pagesから安全にファイルをアップロードできるようにCORS設定を行う。
-   管理者ダッシュボードからWorkerを利用してファイルをアップロードする。

## 🚀 ステップ1: Wrangler CLIのインストール

`Wrangler`は、CloudflareのWorkerを管理するための公式コマンドラインツールです。

1.  **Node.jsとnpmをインストール**:
    まだインストールしていない場合は、[公式サイト](https://nodejs.org/)からLTS版をインストールしてください。

2.  **Wranglerをインストール**:
    ターミナルで以下のコマンドを実行します。
    ```bash
    npm install -g wrangler
    ```

3.  **Cloudflareアカウントにログイン**:
    ```bash
    wrangler login
    ```
    ブラウザが開き、Cloudflareへのログインを求められます。許可すると、ターミナルにログイン情報が保存されます。

## 🚀 ステップ2: プロジェクトの設定

`radio-app-github` フォルダのルートに `wrangler.toml` という設定ファイルを作成します。

**`wrangler.toml`**
```toml
name = "radio-app-r2-uploader" # Workerの名前（任意）
main = "r2-upload-worker.js"    # Workerスクリプトのファイルパス
compatibility_date = "2023-10-30" # 作成日の日付を指定

# R2バケットとの連携設定
[[r2_buckets]]
binding = "RADIO_APP_BUCKET" # Workerスクリプト内でアクセスする際の変数名
bucket_name = "ここにR2バケット名を入力" # Cloudflareダッシュボードで作成したR2バケット名
```

**⚠️注意**: `bucket_name` には、Cloudflareで作成したR2バケットの正確な名前（例: `radio-app-audio`）を入力してください。

## 🚀 ステップ3: Workerのデプロイ

設定ファイルが準備できたら、デプロイはコマンド一発で完了します。

1.  **ターミナルで `radio-app-github` フォルダに移動**:
    ```bash
    cd /Users/Slashie\ Labo/cursor/radio-app-github
    ```

2.  **デプロイコマンドを実行**:
    ```bash
    wrangler deploy
    ```

デプロイが成功すると、`...workers.dev`で終わるURLが表示されます。これがアップロード用のAPIエンドポイントになります。このURLをメモしておいてください。

**例**: `https://radio-app-r2-uploader.your-subdomain.workers.dev`

## 🚀 ステップ4: R2バケットの公開設定

音声ファイルをリスナーが再生できるように、R2バケットをインターネットに公開する必要があります。

1.  Cloudflareダッシュボードで **R2** > **対象のバケット** に移動します。
2.  **Settings** タブを開きます。
3.  **Public Access** のセクションで、**Allow Access** ボタンをクリックします。
4.  表示された`...r2.dev`の公開URLを確認し、これをメモしておいてください。これが音声ファイルのベースURLになります。

**例**: `https://pub-xxxxxxxx.r2.dev`

## 🚀 ステップ5: 管理者ダッシュボードの更新

最後に、デプロイしたWorkerとR2の公開URLを管理者ダッシュボードに設定します。

`admin-dashboard.html` の `<script>` タグ内を以下のように修正します。

1.  **グローバル設定を追加**:
    `AdminDashboard` クラスの `constructor` の直前あたりに、設定変数を追加します。

    ```javascript
    // ===== CONFIGURATION =====
    const WORKER_URL = "ここにWorkerのURLをペースト"; // 例: https://radio-app-r2-uploader....workers.dev
    const R2_PUBLIC_URL = "ここにR2の公開URLをペースト"; // 例: https://pub-xxxxxxxx.r2.dev
    // =========================

    class AdminDashboard {
        // ... (既存のコード)
    }
    ```

2.  **アップロード処理を実装**:
    `AdminDashboard` クラス内に、アップロードフォームを処理するメソッドを追加します。

    ```javascript
    // AdminDashboard クラス内
    
    // constructor の中でイベントリスナーを登録
    constructor() {
        // ... (既存のコード)
        document.getElementById('uploadForm').addEventListener('submit', (e) => this.handleUpload(e));
    }

    // 新しいメソッドを追加
    async handleUpload(e) {
        e.preventDefault();
        const audioFileInput = document.getElementById('audioFile');
        const file = audioFileInput.files[0];
        const progressDiv = document.getElementById('uploadProgress');

        if (!file) {
            progressDiv.textContent = 'ファイルが選択されていません。';
            progressDiv.style.color = 'red';
            return;
        }

        // ファイル名をサニタイズ（推奨）
        const filename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');

        progressDiv.textContent = 'アップロードを開始します...';
        progressDiv.style.color = 'black';

        try {
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                body: file,
                headers: {
                    'Content-Type': 'audio/mpeg',
                    'X-Custom-Filename': filename,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`アップロードに失敗しました: ${errorText}`);
            }

            const result = await response.json();
            
            // 成功メッセージを表示
            progressDiv.textContent = `✅ アップロード成功！`;
            progressDiv.style.color = 'green';
            
            // アップロードされたファイルのURLをリストに追加するなどの処理
            console.log('File URL:', `${R2_PUBLIC_URL}/${result.filename}`);
            
            // フォームをリセット
            audioFileInput.value = '';

        } catch (error) {
            console.error(error);
            progressDiv.textContent = `❌ ${error.message}`;
            progressDiv.style.color = 'red';
        }
    }
    ```

これで全ての連携が完了です！管理者ダッシュボードから音声ファイルをアップロードし、R2に保存されるか試してみてください。
