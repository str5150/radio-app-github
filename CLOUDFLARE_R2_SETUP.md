# Cloudflare R2 セットアップガイド

## 🎯 概要

Cloudflare R2を使用して音声ファイルをホストし、高速ストリーミング配信を実現します。

## 📋 前提条件

- Cloudflareアカウント（無料）
- 音声ファイル（MP3形式）

## 🚀 セットアップ手順

### 1. Cloudflareアカウントの作成

1. [Cloudflare](https://cloudflare.com) にアクセス
2. 「Sign Up」でアカウント作成
3. メール認証を完了

### 2. R2ストレージの作成

1. Cloudflareダッシュボードにログイン
2. 左メニューから「R2 Object Storage」を選択
3. 「Create bucket」をクリック
4. バケット名を入力（例：`radio-app-audio`）
5. 「Create bucket」で作成完了

### 3. カスタムドメインの設定（推奨）

1. R2バケットの「Settings」タブ
2. 「Custom Domains」セクション
3. 「Connect Domain」をクリック
4. ドメインを入力（例：`audio.yourdomain.com`）
5. DNS設定を完了

### 4. API トークンの作成

1. 「Manage R2 API tokens」をクリック
2. 「Create API token」を選択
3. トークン名を入力（例：`radio-app-upload`）
4. 権限を設定：
   - `Object:Edit`
   - `Object:Read`
5. 「Create API token」で作成
6. **トークンを安全に保存**

## 🔧 アプリケーション側の設定

### 環境変数の設定

```javascript
// config.js
const CLOUDFLARE_CONFIG = {
  accountId: 'your-account-id',
  accessKeyId: 'your-access-key-id',
  secretAccessKey: 'your-secret-access-key',
  bucketName: 'radio-app-audio',
  customDomain: 'https://audio.yourdomain.com' // カスタムドメイン使用時
};
```

### 音声ファイルのアップロード

```javascript
// upload-audio.js
async function uploadAudioToR2(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/api/upload-audio', {
    method: 'POST',
    body: formData,
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_CONFIG.accessKeyId}`
    }
  });
  
  return response.json();
}
```

## 📁 ディレクトリ構造

```
radio-app-audio/
├── episodes/
│   ├── episode-001.mp3
│   ├── episode-002.mp3
│   └── episode-003.mp3
├── covers/
│   ├── cover-001.jpg
│   └── cover-002.jpg
└── temp/
    └── uploads/
```

## 🔒 セキュリティ設定

### CORS設定

```json
{
  "AllowedOrigins": ["https://yourusername.github.io"],
  "AllowedMethods": ["GET", "POST", "PUT"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}
```

### アクセス制御

- 音声ファイル：公開読み取り
- アップロード：管理者のみ
- 削除：管理者のみ

## 💰 料金

### 無料枠
- ストレージ：10GB/月
- リクエスト：100万/月
- 帯域幅：無制限

### 超過時の料金
- ストレージ：$0.015/GB/月
- リクエスト：$0.36/100万リクエスト

## 🎵 音声ファイルの最適化

### 推奨設定
- 形式：MP3
- ビットレート：128kbps
- サンプルレート：44.1kHz
- チャンネル：ステレオ

### ファイルサイズの目安
- 15分のエピソード：約15MB
- 30分のエピソード：約30MB

## 🔄 バックアップ戦略

1. **ローカルバックアップ**
   - 音声ファイルのローカル保存
   - 定期的なバックアップ

2. **複数リージョン**
   - 複数のR2バケット
   - 災害復旧対応

## 📊 監視と分析

### メトリクス
- ダウンロード数
- 帯域幅使用量
- エラー率

### アラート設定
- ストレージ使用量
- 異常なアクセス
- エラー率の上昇

## 🚨 トラブルシューティング

### よくある問題

1. **CORS エラー**
   - CORS設定を確認
   - ドメインの設定を確認

2. **アップロード失敗**
   - API トークンの権限を確認
   - ファイルサイズ制限を確認

3. **再生エラー**
   - 音声ファイルの形式を確認
   - ネットワーク接続を確認

## 📞 サポート

- [Cloudflare R2 ドキュメント](https://developers.cloudflare.com/r2/)
- [Cloudflare サポート](https://support.cloudflare.com/)
- [コミュニティフォーラム](https://community.cloudflare.com/)

---

**注意**: API トークンは絶対に公開しないでください。環境変数や設定ファイルで管理し、GitHubにコミットしないよう注意してください。
