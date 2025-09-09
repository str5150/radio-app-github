// VAPID Public Key - web-push generate-vapid-keysで生成したもの
const VAPID_PUBLIC_KEY = 'BDklodHnx0KIqk9nWoxo3J_MXOUqW-C0wliaxCK4ZIKMDFP7PL6PFG2qIxxlDFofcfH6Q4ogOL_mEtNgCStMBnM';

// Service WorkerとPush通知の初期化
async function initServiceWorker() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker registered:', registration);
            
            const subscription = await registration.pushManager.getSubscription();
            if (subscription === null) {
                console.log('Not subscribed to push notifications.');
            } else {
                console.log('Already subscribed:', subscription);
                sendSubscriptionToServer(subscription);
            }
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

// ユーザーに通知の許可を求め、購読を開始する関数
async function subscribeUserToPush() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        
        console.log('User is subscribed:', subscription);
        await sendSubscriptionToServer(subscription);
        alert('プッシュ通知が有効になりました！');
    } catch (error) {
        console.error('Failed to subscribe the user: ', error);
        if (Notification.permission === 'denied') {
            alert('通知がブロックされています。ブラウザの設定から通知を許可してください。');
        } else {
            alert('プッシュ通知を有効にできませんでした。');
        }
    }
}

// 購読情報をサーバー(Worker)に送信する
async function sendSubscriptionToServer(subscription) {
    const WORKER_URL = 'https://radio-app-r2-uploader.str-radio.workers.dev';
    try {
        await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Action': 'subscribe'
            },
            body: JSON.stringify(subscription),
        });
        console.log('Successfully sent subscription to server.');
    } catch (error) {
        console.error('Failed to send subscription to server: ', error);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

class RadioApp {
    constructor() {
        this.episodes = [];
        this.currentEpisodeIndex = -1;
        this.audio = new Audio();
        this.isPlaying = false;
        
        this.elements = {
            episodesList: document.getElementById('episodeList'),
            playerCover: document.getElementById('playerCover'),
            playerTitle: document.getElementById('playerTitle'),
            playerDescription: document.getElementById('playerDescription'),
            playPauseBtn: document.getElementById('playPauseBtn'),
            progressBar: document.getElementById('progressBar'),
            currentTime: document.getElementById('currentTime'),
            duration: document.getElementById('duration'),
            volumeSlider: document.getElementById('volumeSlider'),
            speedButtons: document.querySelectorAll('.speed-btn'),
            subscribeBtn: document.getElementById('subscribeBtn'),
            prevBtn: document.getElementById('prevBtn'),
            nextBtn: document.getElementById('nextBtn'),
            commentModal: document.getElementById('commentModal'),
            closeCommentModal: document.getElementById('closeCommentModal'),
            commentModalTitle: document.getElementById('commentModalTitle'),
            commentsList: document.getElementById('commentsList'),
            commentText: document.getElementById('commentText'),
            sendComment: document.getElementById('sendComment'),
            cancelComment: document.getElementById('cancelComment'),
            viewGridBtn: document.getElementById('viewGridBtn'),
            viewListBtn: document.getElementById('viewListBtn'),
        };
        
        this.currentCommentEpisode = null;

        this.bindEvents();
        this.fetchEpisodes();
        this.applyPreferredView();
    }

    bindEvents() {
        this.elements.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.elements.progressBar.addEventListener('input', (e) => this.seekTo(e.target.value));
        this.elements.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        this.elements.speedButtons.forEach(btn => btn.addEventListener('click', (e) => this.setPlaybackSpeed(e.target.dataset.speed)));
        this.elements.subscribeBtn.addEventListener('click', subscribeUserToPush);
        this.elements.nextBtn.addEventListener('click', () => this.playNext());
        this.elements.prevBtn.addEventListener('click', () => this.playPrev());
        
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('ended', () => this.playNext());

        this.elements.closeCommentModal.addEventListener('click', () => this.hideCommentModal());
        this.elements.sendComment.addEventListener('click', () => this.sendComment());
        this.elements.cancelComment.addEventListener('click', () => this.hideCommentModal());

        this.elements.viewGridBtn.addEventListener('click', () => this.setView('grid'));
        this.elements.viewListBtn.addEventListener('click', () => this.setView('list'));
    }

    async fetchEpisodes() {
        try {
            const response = await fetch('episodes.json');
            const data = await response.json();
            this.episodes = data.episodes;
            this.renderEpisodes();
        } catch (error) {
            console.error('Error fetching episodes:', error);
        }
    }

    renderEpisodes() {
        this.elements.episodesList.innerHTML = '';
        this.episodes.forEach((episode, index) => {
            const card = this.createEpisodeCard(episode, index);
            this.elements.episodesList.appendChild(card);
        });
        this.restoreLikeStates();
    }

    createEpisodeCard(episode, index) {
        const card = document.createElement('div');
        card.className = 'episode-card';
        card.dataset.index = index;
        const publishedDate = new Date(episode.publishedAt).toLocaleDateString('ja-JP');

        card.innerHTML = `
            <img class="episode-cover-small" src="${episode.coverImage}" alt="${episode.title}">
            <div class="episode-content">
                <h3 class="episode-title-small">${episode.title}</h3>
                <p class="episode-description-small">${episode.description}</p>
                <div class="episode-meta">
                    <span class="episode-date">${publishedDate}</span>
                    <span class="episode-duration">${episode.duration}</span>
                </div>
                 <div class="episode-actions">
                    <button class="like-btn" data-episode-id="${episode.id}">
                        <svg class="like-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        <span class="like-count">${episode.likes || 0}</span>
                    </button>
                    <button class="comment-btn" data-episode-id="${episode.id}">
                        <svg class="comment-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        <span class="comment-count">${episode.comments?.length || 0}</span>
                    </button>
                </div>
            </div>`;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.like-btn') || e.target.closest('.comment-btn')) return;
            this.playEpisode(index);
        });

        card.querySelector('.like-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleLike(episode.id);
        });
        card.querySelector('.comment-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showCommentModal(episode);
        });
        return card;
    }

    playEpisode(index) {
        if (index < 0 || index >= this.episodes.length) return;
        this.currentEpisodeIndex = index;
        const episode = this.episodes[index];
        this.audio.src = episode.audioUrl;
        this.updatePlayerUI(episode);
        this.audio.play();
        this.isPlaying = true;
        this.updatePlayPauseIcon();
        this.updateMediaSession(episode);
    }
    
    playNext() {
        this.playEpisode((this.currentEpisodeIndex + 1) % this.episodes.length);
    }
    
    playPrev() {
        const newIndex = (this.currentEpisodeIndex - 1 + this.episodes.length) % this.episodes.length;
        this.playEpisode(newIndex);
    }

    updatePlayerUI(episode) {
        this.elements.playerCover.src = episode.coverImage;
        this.elements.playerTitle.textContent = episode.title;
        this.elements.playerDescription.textContent = episode.description;
        document.getElementById('audioPlayer').classList.add('visible');
    }

    togglePlayPause() {
        if (this.currentEpisodeIndex === -1) {
            this.playEpisode(0);
            return;
        }
        if (this.isPlaying) {
            this.audio.pause();
        } else {
            this.audio.play();
        }
        this.isPlaying = !this.isPlaying;
        this.updatePlayPauseIcon();
    }

    updatePlayPauseIcon() {
        const playIcon = this.elements.playPauseBtn.querySelector('.play-icon');
        const pauseIcon = this.elements.playPauseBtn.querySelector('.pause-icon');
        if (this.isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
    }

    updateProgress() {
        const progress = (this.audio.currentTime / this.audio.duration) * 100;
        this.elements.progressBar.value = isNaN(progress) ? 0 : progress;
        this.elements.currentTime.textContent = this.formatTime(this.audio.currentTime);
    }

    updateDuration() {
        this.elements.duration.textContent = this.formatTime(this.audio.duration);
    }

    seekTo(value) {
        if (!this.audio.duration) return;
        const time = (value / 100) * this.audio.duration;
        this.audio.currentTime = time;
    }

    setVolume(value) {
        this.audio.volume = value;
    }

    setPlaybackSpeed(speed) {
        this.audio.playbackRate = parseFloat(speed);
        this.elements.speedButtons.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.speed-btn[data-speed="${speed}"]`).classList.add('active');
    }
    
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    
    updateMediaSession(episode) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: episode.title,
                artist: 'Radio App',
                album: 'Episodes',
                artwork: [{ src: episode.coverImage, sizes: '400x400', type: 'image/png' }]
            });
            navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
            navigator.mediaSession.setActionHandler('pause', () => this.togglePlayPause());
            navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
            navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrev());
        }
    }
    
    toggleLike(episodeId) {
        const episode = this.episodes.find(ep => ep.id === episodeId);
        if (!episode) return;
        const likedEpisodes = JSON.parse(localStorage.getItem('likedEpisodes') || '[]');
        const isLiked = likedEpisodes.includes(episodeId);
        if (isLiked) {
            episode.likes = Math.max(0, episode.likes - 1);
            likedEpisodes.splice(likedEpisodes.indexOf(episodeId), 1);
        } else {
            episode.likes = (episode.likes || 0) + 1;
            likedEpisodes.push(episodeId);
        }
        localStorage.setItem('likedEpisodes', JSON.stringify(likedEpisodes));
        this.updateLikeButton(episodeId, !isLiked);
        this.updateLikeCount(episodeId, episode.likes);
    }

    updateLikeButton(episodeId, isLiked) {
        const likeBtn = document.querySelector(`.like-btn[data-episode-id="${episodeId}"]`);
        if (likeBtn) {
            likeBtn.classList.toggle('liked', isLiked);
        }
    }

    updateLikeCount(episodeId, count) {
        const likeCount = document.querySelector(`.like-btn[data-episode-id="${episodeId}"] .like-count`);
        if (likeCount) {
            likeCount.textContent = count;
        }
    }
    
    restoreLikeStates() {
        const likedEpisodes = JSON.parse(localStorage.getItem('likedEpisodes') || '[]');
        likedEpisodes.forEach(episodeId => this.updateLikeButton(episodeId, true));
    }

    showCommentModal(episode) {
        this.currentCommentEpisode = episode;
        this.elements.commentModalTitle.textContent = `コメント: ${episode.title}`;
        this.renderComments(episode.comments || []);
        this.elements.commentModal.classList.add('visible');
    }

    hideCommentModal() {
        this.elements.commentModal.classList.remove('visible');
    }

    renderComments(comments) {
        this.elements.commentsList.innerHTML = '';
        if (comments.length === 0) {
            this.elements.commentsList.innerHTML = '<p>まだコメントはありません。</p>';
            return;
        }
        comments.forEach(comment => {
            const item = document.createElement('div');
            item.className = 'comment-item';
            item.innerHTML = `<p>${comment.text}</p><small>${comment.author} - ${new Date(comment.date).toLocaleDateString()}</small>`;
            this.elements.commentsList.appendChild(item);
        });
    }

    async sendComment() {
        const text = this.elements.commentText.value.trim();
        if (!text || !this.currentCommentEpisode) return;
        
        const newComment = {
            id: String(Date.now()),
            text: text,
            author: 'Anonymous',
            date: new Date().toISOString()
        };
        
        if (!this.currentCommentEpisode.comments) {
            this.currentCommentEpisode.comments = [];
        }
        this.currentCommentEpisode.comments.push(newComment);
        
        this.renderComments(this.currentCommentEpisode.comments);
        this.updateCommentCount(this.currentCommentEpisode.id, this.currentCommentEpisode.comments.length);
        this.elements.commentText.value = '';
        
        // メール通知
        this.sendEmailNotification(newComment);
    }
    
    updateCommentCount(episodeId, count) {
        const commentCount = document.querySelector(`.comment-btn[data-episode-id="${episodeId}"] .comment-count`);
        if (commentCount) {
            commentCount.textContent = count;
        }
    }
    
    sendEmailNotification(comment) {
        const episode = this.currentCommentEpisode;
        const subject = `New comment on ${episode.title}`;
        const body = `A new comment has been posted on "${episode.title}":\n\n${comment.text}`;
        window.location.href = `mailto:satoru.slash5150@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    setView(view) {
        localStorage.setItem('preferredView', view);
        this.applyPreferredView();
    }

    applyPreferredView() {
        const preferredView = localStorage.getItem('preferredView') || 'grid';
        if (preferredView === 'list') {
            this.elements.episodesList.classList.add('list-view');
            this.elements.viewListBtn.classList.add('active');
            this.elements.viewGridBtn.classList.remove('active');
        } else {
            this.elements.episodesList.classList.remove('list-view');
            this.elements.viewGridBtn.classList.add('active');
            this.elements.viewListBtn.classList.remove('active');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new RadioApp();
    initServiceWorker();
});
