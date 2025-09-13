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
            audioPlayer: document.getElementById('audioPlayer'),
            playerCover: document.getElementById('playerCover'),
            playerTitle: document.getElementById('playerTitle'),
            playerDescription: document.getElementById('playerDescription'),
            playPauseBtn: document.getElementById('playPauseBtn'),
            progressBar: document.getElementById('progressBar'), // Will be null, handled below
            currentTime: document.getElementById('currentTime'), // Will be null, handled below
            duration: document.getElementById('duration'),       // Will be null, handled below
            
            speedButtons: document.querySelectorAll('.speed-btn'),  // Will be null, handled below
            subscribeBtn: document.getElementById('subscribeBtn'),
            bookmarkListBtn: document.getElementById('bookmarkListBtn'),
            searchInput: document.getElementById('searchInput'),
            searchBtn: document.getElementById('searchBtn'),
            clearSearchBtn: document.getElementById('clearSearchBtn'),
            searchToggleBtn: document.getElementById('searchToggleBtn'),
            searchExpanded: document.getElementById('searchExpanded'),
            prevBtn: document.getElementById('prevBtn'),           // Will be null, handled below
            nextBtn: document.getElementById('nextBtn'),           // Will be null, handled below
            commentModal: document.getElementById('commentModal'),
            closeCommentModal: document.getElementById('closeCommentModal'),
            commentModalTitle: document.getElementById('commentModalTitle'),
            commentsList: document.getElementById('commentsList'),
            commentName: document.getElementById('commentName'),
            commentText: document.getElementById('commentText'),
            sendComment: document.getElementById('sendComment'),
            cancelComment: document.getElementById('cancelComment'),
            // Letter modal elements
            letterModal: document.getElementById('letterModal'),
            closeLetterModal: document.getElementById('closeLetterModal'),
            letterModalTitle: document.getElementById('letterModalTitle'),
            letterName: document.getElementById('letterName'),
            letterSubject: document.getElementById('letterSubject'),
            letterText: document.getElementById('letterText'),
            sendLetter: document.getElementById('sendLetter'),
            cancelLetter: document.getElementById('cancelLetter'),
            viewGridBtn: document.getElementById('viewGridBtn'),
            viewListBtn: document.getElementById('viewListBtn'),
            filterButtons: document.querySelectorAll('.filter-btn'),
            homeBtn: document.querySelector('.app-title'),
            // Now Playing Screen elements
            nowPlayingScreen: document.getElementById('nowPlayingScreen'),
            closePlayerBtn: document.getElementById('closePlayerBtn'),
            nowPlayingCover: document.getElementById('nowPlayingCover'),
            nowPlayingTitle: document.getElementById('nowPlayingTitle'),
            nowPlayingDescription: document.getElementById('nowPlayingDescription'),
            nowPlayingProgressBar: document.getElementById('nowPlayingProgressBar'),
            nowPlayingCurrentTime: document.getElementById('nowPlayingCurrentTime'),
            nowPlayingDuration: document.getElementById('nowPlayingDuration'),
            nowPlayingPrevBtn: document.getElementById('nowPlayingPrevBtn'),
            nowPlayingPlayPauseBtn: document.getElementById('nowPlayingPlayPauseBtn'),
            nowPlayingNextBtn: document.getElementById('nowPlayingNextBtn'),
            // Mini-player specific
            miniPlayerTouchable: document.getElementById('miniPlayerTouchable'),
            closeMiniPlayerBtn: document.getElementById('closeMiniPlayerBtn'),
        };
        
        this.currentCommentEpisode = null;
        this.currentLetterEpisode = null;
        this.touchStartX = 0;
        this.touchMoveX = 0;
        this.isSwiping = false;

        this.bindEvents();
        this.fetchEpisodes();
        this.applyPreferredView();
    }

    bindEvents() {
        this.elements.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        if (this.elements.progressBar) {
            this.elements.progressBar.addEventListener('input', (e) => this.seekTo(e.target.value));
        }
        if (this.elements.nextBtn) {
            this.elements.nextBtn.addEventListener('click', () => this.playNext());
        }
        if (this.elements.prevBtn) {
            this.elements.prevBtn.addEventListener('click', () => this.playPrev());
        }
        if (this.elements.speedButtons) {
            this.elements.speedButtons.forEach(btn => {
                btn.addEventListener('click', (e) => this.setPlaybackSpeed(parseFloat(e.target.dataset.speed)));
            });
        }
        
        this.elements.subscribeBtn.addEventListener('click', subscribeUserToPush);
        
        if (this.elements.bookmarkListBtn) {
            this.elements.bookmarkListBtn.addEventListener('click', () => this.showBookmarkList());
        }

        // Search functionality
        if (this.elements.searchToggleBtn) {
            this.elements.searchToggleBtn.addEventListener('click', () => this.toggleSearch());
        }
        
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
            this.elements.searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSearch(e.target.value);
                }
            });
        }
        
        if (this.elements.searchBtn) {
            this.elements.searchBtn.addEventListener('click', () => {
                // If search input is empty, focus on it for user input
                if (!this.elements.searchInput.value.trim()) {
                    this.elements.searchInput.focus();
                } else {
                    // If there's text, perform search
                    this.handleSearch(this.elements.searchInput.value);
                }
            });
        }
        
        if (this.elements.clearSearchBtn) {
            this.elements.clearSearchBtn.addEventListener('click', () => this.clearSearch());
        }

        // Home button functionality
        if (this.elements.homeBtn) {
            this.elements.homeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.goHome();
            });
        }

        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('ended', () => this.playNext());

        this.elements.closeCommentModal.addEventListener('click', () => this.hideCommentModal());
        this.elements.sendComment.addEventListener('click', () => this.sendComment());
        this.elements.cancelComment.addEventListener('click', () => this.hideCommentModal());

        // Letter modal events
        this.elements.closeLetterModal.addEventListener('click', () => this.hideLetterModal());
        this.elements.sendLetter.addEventListener('click', () => this.sendLetter());
        this.elements.cancelLetter.addEventListener('click', () => this.hideLetterModal());

        this.elements.viewGridBtn.addEventListener('click', () => this.setView('grid'));
        this.elements.viewListBtn.addEventListener('click', () => this.setView('list'));
        this.elements.filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => this.filterAndSortEpisodes(e.target.dataset.filter));
        });

        // Mini Player close and swipe
        this.elements.closeMiniPlayerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dismissMiniPlayer();
        });

        const touchableArea = this.elements.miniPlayerTouchable;
        touchableArea.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        touchableArea.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: true });
        touchableArea.addEventListener('touchend', (e) => this.handleTouchEnd(e));


        // Now Playing Screen events
        touchableArea.addEventListener('click', () => {
             // If it was a swipe, don't open the player
            if (this.isSwiping) {
                this.isSwiping = false; // Reset swipe flag
                return;
            }
            this.openPlayerScreen();
        });
        this.elements.closePlayerBtn.addEventListener('click', () => this.closePlayerScreen());
        this.elements.nowPlayingPlayPauseBtn.addEventListener('click', () => this.togglePlayPause());
        if (this.elements.nowPlayingProgressBar) {
            this.elements.nowPlayingProgressBar.addEventListener('input', (e) => this.seekTo(e.target.value));
        }
        if (this.elements.nowPlayingNextBtn) {
            this.elements.nowPlayingNextBtn.addEventListener('click', () => this.playNext());
        }
        if (this.elements.nowPlayingPrevBtn) {
            this.elements.nowPlayingPrevBtn.addEventListener('click', () => this.playPrev());
        }

        // Add speed controls for the full screen player
        const speedBtns = document.querySelectorAll('.now-playing-screen .speed-btn');
        speedBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseFloat(e.target.dataset.speed);
                this.setPlaybackSpeed(speed, e.target);
            });
        });
    }

    // URLパラメータを処理してエピソードを直接表示・再生
    handleURLParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const episodeId = urlParams.get('episode');
        const action = urlParams.get('action');
        
        if (episodeId) {
            // 特定のエピソードを表示
            const episodeIndex = this.episodes.findIndex(ep => ep.id === episodeId);
            if (episodeIndex !== -1) {
                if (action === 'play') {
                    // 直接再生
                    this.playEpisode(episodeIndex);
                } else {
                    // エピソードを表示（再生はしない）
                    this.highlightEpisode(episodeIndex);
                }
            }
        }
    }

    // エピソードをハイライト表示
    highlightEpisode(index) {
        // エピソードリストを表示
        this.showAllEpisodes();
        
        // 該当エピソードをスクロールして表示
        setTimeout(() => {
            const episodeElement = document.querySelector(`[data-episode-index="${index}"]`);
            if (episodeElement) {
                episodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }

    // エピソードの共有リンクを生成
    generateEpisodeLink(episodeId, action = 'view') {
        const baseUrl = window.location.origin + window.location.pathname;
        return `${baseUrl}?episode=${episodeId}&action=${action}`;
    }

    // 共有モーダルを表示
    showShareModal(episode) {
        const viewLink = this.generateEpisodeLink(episode.id, 'view');
        const playLink = this.generateEpisodeLink(episode.id, 'play');
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>エピソードを共有</h3>
                    <button class="close-modal-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>${episode.title}</strong></p>
                    <div class="share-options">
                        <div class="share-option">
                            <label>エピソードを表示するリンク:</label>
                            <div class="link-container">
                                <input type="text" value="${viewLink}" readonly class="share-link-input">
                                <button class="copy-btn" data-link="${viewLink}">コピー</button>
                            </div>
                        </div>
                        <div class="share-option">
                            <label>エピソードを直接再生するリンク:</label>
                            <div class="link-container">
                                <input type="text" value="${playLink}" readonly class="share-link-input">
                                <button class="copy-btn" data-link="${playLink}">コピー</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary close-modal-btn">閉じる</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // イベントリスナー
        modal.querySelectorAll('.close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });
        
        modal.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const link = e.target.dataset.link;
                
                // モダンブラウザのClipboard APIを使用
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(link).then(() => {
                        e.target.textContent = 'コピー済み!';
                        setTimeout(() => {
                            e.target.textContent = 'コピー';
                        }, 2000);
                    }).catch((err) => {
                        console.error('Failed to copy: ', err);
                        fallbackCopy(link, e.target);
                    });
                } else {
                    // フォールバック: 古いブラウザ用
                    fallbackCopy(link, e.target);
                }
            });
        });
        
        // フォールバック用のコピー関数
        const fallbackCopy = (text, button) => {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    button.textContent = 'コピー済み!';
                    setTimeout(() => {
                        button.textContent = 'コピー';
                    }, 2000);
                } else {
                    button.textContent = 'コピー失敗';
                    setTimeout(() => {
                        button.textContent = 'コピー';
                    }, 2000);
                }
            } catch (err) {
                console.error('Fallback copy failed: ', err);
                button.textContent = 'コピー失敗';
                setTimeout(() => {
                    button.textContent = 'コピー';
                }, 2000);
            }
            
            document.body.removeChild(textArea);
        };
        
        // モーダル外クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    openPlayerScreen() {
        if (this.currentEpisodeIndex === -1) return; // Don't open if nothing is playing
        this.elements.nowPlayingScreen.classList.add('visible');
        // Prevent body scroll
        document.body.classList.add('player-open');
    }

    closePlayerScreen() {
        this.elements.nowPlayingScreen.classList.remove('visible');
        // Restore body scroll
        document.body.classList.remove('player-open');
    }

    dismissMiniPlayer() {
        this.elements.audioPlayer.classList.remove('visible');
        if (this.isPlaying) {
            this.audio.pause();
            this.isPlaying = false;
            this.updatePlayPauseIcon();
        }
    }

    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.isSwiping = false;
        this.elements.audioPlayer.style.transition = 'none';
    }

    handleTouchMove(e) {
        if (!this.touchStartX) return;
        this.touchMoveX = e.touches[0].clientX;
        const diffX = this.touchMoveX - this.touchStartX;
        
        // Start swiping only after a certain threshold
        if (Math.abs(diffX) > 10) { 
            this.isSwiping = true;
        }

        // Only allow left swipe and apply transformation
        if (diffX < 0) { 
             this.elements.audioPlayer.style.transform = `translateX(${diffX}px)`;
        }
    }

    handleTouchEnd(e) {
        const diffX = this.touchMoveX - this.touchStartX;
        this.elements.audioPlayer.style.transition = 'transform 0.3s ease, bottom 0.4s cubic-bezier(0.25, 1, 0.5, 1)';

        if (this.isSwiping && diffX < -50) { // Threshold for dismiss
            this.elements.audioPlayer.style.transform = 'translateX(-150%)';
            setTimeout(() => {
                this.dismissMiniPlayer();
                this.elements.audioPlayer.style.transform = 'translateX(0)';
            }, 300);
        } else {
            this.elements.audioPlayer.style.transform = 'translateX(0)';
        }

        this.touchStartX = 0;
        this.touchMoveX = 0;
        // isSwiping is reset in the click handler to prevent race conditions
    }

    async fetchEpisodes() {
        try {
            const response = await fetch(`episodes.json?t=${new Date().getTime()}`);
            if (!response.ok) {
                throw new Error('Failed to load episodes.json');
            }
            const data = await response.json();
            this.episodes = data.episodes;
            this.filterAndSortEpisodes('all'); // 初期表示
        } catch (error) {
            console.error('Error fetching episodes:', error);
        }
    }

    renderEpisodes(episodesToRender) {
        this.elements.episodesList.innerHTML = '';
        const episodes = episodesToRender || this.episodes;
        episodes.forEach((episode, index) => {
            // 注意：元の配列でのインデックスを見つける必要があるため、findindexを使用
            const originalIndex = this.episodes.findIndex(ep => ep.id === episode.id);
            const card = this.createEpisodeCard(episode, originalIndex);
            this.elements.episodesList.appendChild(card);
        });
        this.restoreLikeStates();
        this.restoreBookmarkStates();
    }

    createEpisodeCard(episode, index) {
        const card = document.createElement('div');
        card.className = 'episode-card';
        card.dataset.index = index;
        card.dataset.episodeIndex = index;
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
                        <span class="like-count">${this.getEpisodeLikeCount(episode.id)}</span>
                    </button>
                    <button class="comment-btn" data-episode-id="${episode.id}">
                        <svg class="comment-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        <span class="comment-count">${episode.comments?.length || 0}</span>
                    </button>
                    <button class="letter-btn" data-episode-id="${episode.id}" title="レター送信">
                        <svg class="letter-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 9-18 9v-7l15-2-15-2V3z"></path></svg>
                    </button>
                    <button class="bookmark-btn" data-episode-id="${episode.id}" title="ブックマーク">
                        <svg class="bookmark-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>
                    </button>
                    <button class="share-btn" data-episode-id="${episode.id}" title="共有">
                        <svg class="share-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16,6 12,2 8,6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                    </button>
                </div>
            </div>`;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.like-btn') || e.target.closest('.comment-btn') || e.target.closest('.letter-btn') || e.target.closest('.bookmark-btn') || e.target.closest('.share-btn')) return;
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
        card.querySelector('.letter-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showLetterModal(episode);
        });
        card.querySelector('.bookmark-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleBookmark(episode.id);
        });
        card.querySelector('.share-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showShareModal(episode);
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
        this.trackPlay(episode.id); // 再生を記録
    }
    
    playNext() {
        const nextIndex = this.currentEpisodeIndex + 1;
        if (nextIndex < this.episodes.length) {
            this.playEpisode(nextIndex);
        } else {
            // 最後のエピソードの場合は停止
            this.audio.pause();
            this.updatePlayPauseIcon();
        }
    }
    
    playPrev() {
        const newIndex = (this.currentEpisodeIndex - 1 + this.episodes.length) % this.episodes.length;
        this.playEpisode(newIndex);
    }

    updatePlayerUI(episode) {
        // Mini Player
        this.elements.playerCover.src = episode.coverImage;
        this.elements.playerTitle.textContent = episode.title;
        this.elements.playerDescription.textContent = episode.description;
        document.getElementById('audioPlayer').classList.add('visible');

        // Full Screen Player
        this.elements.nowPlayingCover.src = episode.coverImage;
        this.elements.nowPlayingTitle.textContent = episode.title;
        this.elements.nowPlayingDescription.textContent = episode.description;
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
        // Mini Player
        const playIcon = this.elements.playPauseBtn.querySelector('.play-icon');
        const pauseIcon = this.elements.playPauseBtn.querySelector('.pause-icon');
        if (this.isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
        
        // Full Screen Player
        const fullPlayIcon = this.elements.nowPlayingPlayPauseBtn.querySelector('.play-icon');
        const fullPauseIcon = this.elements.nowPlayingPlayPauseBtn.querySelector('.pause-icon');
         if (this.isPlaying) {
            fullPlayIcon.style.display = 'none';
            fullPauseIcon.style.display = 'block';
        } else {
            fullPlayIcon.style.display = 'block';
            fullPauseIcon.style.display = 'none';
        }
    }

    updateProgress() {
        const progress = (this.audio.currentTime / this.audio.duration) * 100;
        const formattedTime = this.formatTime(this.audio.currentTime);

        // Mini Player (Now optional)
        if(this.elements.progressBar) this.elements.progressBar.value = isNaN(progress) ? 0 : progress;
        if(this.elements.currentTime) this.elements.currentTime.textContent = formattedTime;

        // Full Screen Player
        this.elements.nowPlayingProgressBar.value = isNaN(progress) ? 0 : progress;
        this.elements.nowPlayingCurrentTime.textContent = formattedTime;
    }

    updateDuration() {
        const formattedDuration = this.formatTime(this.audio.duration);
        // Mini Player (Now optional)
        if(this.elements.duration) this.elements.duration.textContent = formattedDuration;
        
        // Full Screen Player
        this.elements.nowPlayingDuration.textContent = formattedDuration;
    }

    seekTo(value) {
        if (!this.audio.duration) return;
        const time = (value / 100) * this.audio.duration;
        this.audio.currentTime = time;
    }

    setPlaybackSpeed(speed, activeBtn) {
        this.audio.playbackRate = parseFloat(speed);
        
        // Update active state for buttons within the full screen player
        const speedBtns = document.querySelectorAll('.now-playing-screen .speed-btn');
        speedBtns.forEach(btn => btn.classList.remove('active'));
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
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

    trackPlay(episodeId) {
        const WORKER_URL = 'https://radio-app-r2-uploader.str-radio.workers.dev';
        // バックグラウンドで再生回数を送信（エラーはコンソールに出力するだけ）
        fetch(WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Action': 'track_play'
            },
            body: JSON.stringify({ episodeId })
        }).catch(error => console.error('Failed to track play:', error));
    }
    
    toggleLike(episodeId) {
        const episode = this.episodes.find(ep => ep.id === episodeId);
        if (!episode) return;
        
        const likedEpisodes = JSON.parse(localStorage.getItem('likedEpisodes') || '[]');
        const likeCounts = JSON.parse(localStorage.getItem('episodeLikeCounts') || '{}');
        
        const isLiked = likedEpisodes.includes(episodeId);
        
        if (isLiked) {
            // Unlike
            likedEpisodes.splice(likedEpisodes.indexOf(episodeId), 1);
            likeCounts[episodeId] = Math.max(0, (likeCounts[episodeId] || 0) - 1);
        } else {
            // Like
            likedEpisodes.push(episodeId);
            likeCounts[episodeId] = (likeCounts[episodeId] || 0) + 1;
        }
        
        localStorage.setItem('likedEpisodes', JSON.stringify(likedEpisodes));
        localStorage.setItem('episodeLikeCounts', JSON.stringify(likeCounts));
        
        this.updateLikeButton(episodeId, !isLiked);
        this.updateLikeCount(episodeId, likeCounts[episodeId]);
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

    getEpisodeLikeCount(episodeId) {
        const likeCounts = JSON.parse(localStorage.getItem('episodeLikeCounts') || '{}');
        return likeCounts[episodeId] || 0;
    }

    toggleBookmark(episodeId) {
        const bookmarkedEpisodes = JSON.parse(localStorage.getItem('bookmarkedEpisodes') || '[]');
        const isBookmarked = bookmarkedEpisodes.includes(episodeId);
        
        if (isBookmarked) {
            // Remove bookmark
            bookmarkedEpisodes.splice(bookmarkedEpisodes.indexOf(episodeId), 1);
        } else {
            // Add bookmark
            bookmarkedEpisodes.push(episodeId);
        }
        
        localStorage.setItem('bookmarkedEpisodes', JSON.stringify(bookmarkedEpisodes));
        this.updateBookmarkButton(episodeId, !isBookmarked);
    }

    updateBookmarkButton(episodeId, isBookmarked) {
        const bookmarkBtn = document.querySelector(`.bookmark-btn[data-episode-id="${episodeId}"]`);
        if (bookmarkBtn) {
            bookmarkBtn.classList.toggle('bookmarked', isBookmarked);
            // Update title attribute for tooltip
            bookmarkBtn.title = isBookmarked ? 'ブックマーク済み' : 'ブックマーク';
        }
    }

    restoreBookmarkStates() {
        const bookmarkedEpisodes = JSON.parse(localStorage.getItem('bookmarkedEpisodes') || '[]');
        bookmarkedEpisodes.forEach(episodeId => this.updateBookmarkButton(episodeId, true));
    }

    showBookmarkList() {
        const bookmarkedEpisodes = JSON.parse(localStorage.getItem('bookmarkedEpisodes') || '[]');
        
        if (bookmarkedEpisodes.length === 0) {
            alert('ブックマークされたエピソードはありません。');
            return;
        }
        
        // Filter episodes to show only bookmarked ones
        const bookmarkedEpisodeData = this.episodes.filter(episode => 
            bookmarkedEpisodes.includes(episode.id)
        );
        
        // Update section title
        const sectionTitle = document.querySelector('.section-title');
        if (sectionTitle) {
            sectionTitle.textContent = `ブックマーク (${bookmarkedEpisodeData.length}件)`;
        }
        
        // Hide filter controls
        const filterControls = document.querySelector('.filter-controls');
        if (filterControls) {
            filterControls.style.display = 'none';
        }
        
        // Show back to all episodes button
        this.showBackToAllButton();
        
        // Render only bookmarked episodes
        this.renderEpisodes(bookmarkedEpisodeData);
    }

    showBackToAllButton() {
        // Check if back button already exists
        if (document.getElementById('backToAllBtn')) return;
        
        const sectionTitle = document.querySelector('.section-title');
        if (sectionTitle) {
            const backBtn = document.createElement('button');
            backBtn.id = 'backToAllBtn';
            backBtn.className = 'btn btn-secondary';
            backBtn.style.marginLeft = '16px';
            backBtn.style.fontSize = '14px';
            backBtn.textContent = '← すべてのエピソード';
            backBtn.addEventListener('click', () => this.showAllEpisodes());
            sectionTitle.appendChild(backBtn);
        }
    }

    showAllEpisodes() {
        // Remove back button
        const backBtn = document.getElementById('backToAllBtn');
        if (backBtn) {
            backBtn.remove();
        }
        
        // Restore section title
        const sectionTitle = document.querySelector('.section-title');
        if (sectionTitle) {
            sectionTitle.textContent = 'すべてのエピソード';
        }
        
        // Show filter controls
        const filterControls = document.querySelector('.filter-controls');
        if (filterControls) {
            filterControls.style.display = 'flex';
        }
        
        // Render all episodes
        this.renderEpisodes();
    }

    handleSearch(query) {
        const trimmedQuery = query.trim().toLowerCase();
        
        if (trimmedQuery === '') {
            this.clearSearch();
            return;
        }
        
        // Show clear button
        if (this.elements.clearSearchBtn) {
            this.elements.clearSearchBtn.style.display = 'block';
        }
        
        // Filter episodes based on title and description
        const filteredEpisodes = this.episodes.filter(episode => {
            const titleMatch = episode.title.toLowerCase().includes(trimmedQuery);
            const descriptionMatch = episode.description.toLowerCase().includes(trimmedQuery);
            return titleMatch || descriptionMatch;
        });
        
        // Update section title
        const sectionTitle = document.querySelector('.section-title');
        if (sectionTitle) {
            sectionTitle.textContent = `検索結果: "${query}" (${filteredEpisodes.length}件)`;
        }
        
        // Hide filter controls
        const filterControls = document.querySelector('.filter-controls');
        if (filterControls) {
            filterControls.style.display = 'none';
        }
        
        // Show back to all episodes button
        this.showBackToAllButton();
        
        // Render filtered episodes
        this.renderEpisodes(filteredEpisodes);
    }

    toggleSearch() {
        if (this.elements.searchExpanded) {
            const isExpanded = this.elements.searchExpanded.style.display !== 'none';
            if (isExpanded) {
                // Hide search
                this.elements.searchExpanded.style.display = 'none';
                this.clearSearch();
            } else {
                // Show search
                this.elements.searchExpanded.style.display = 'flex';
                // Focus on input after a short delay to ensure it's visible
                setTimeout(() => {
                    if (this.elements.searchInput) {
                        this.elements.searchInput.focus();
                    }
                }, 100);
            }
        }
    }

    clearSearch() {
        // Clear search input
        if (this.elements.searchInput) {
            this.elements.searchInput.value = '';
        }
        
        // Hide clear button
        if (this.elements.clearSearchBtn) {
            this.elements.clearSearchBtn.style.display = 'none';
        }
        
        // Show all episodes
        this.showAllEpisodes();
    }

    goHome() {
        // Clear search
        this.clearSearch();
        
        // Make sure we're showing all episodes (not bookmarks)
        this.showAllEpisodes();
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
        // Clear form
        this.elements.commentName.value = '';
        this.elements.commentText.value = '';
    }

    showLetterModal(episode) {
        this.currentLetterEpisode = episode;
        this.elements.letterModalTitle.textContent = `レター送信: ${episode.title}`;
        this.elements.letterModal.classList.add('visible');
    }

    hideLetterModal() {
        this.elements.letterModal.classList.remove('visible');
        // Clear form
        this.elements.letterName.value = '';
        this.elements.letterSubject.value = '';
        this.elements.letterText.value = '';
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
            
            // 現在のユーザーIDを取得（ローカルストレージから）
            const currentUserId = this.getCurrentUserId();
            const isOwnComment = comment.userId === currentUserId;
            
            item.innerHTML = `
                <div class="comment-content">
                    <p>${comment.text}</p>
                    <small>${comment.author} - ${new Date(comment.date).toLocaleDateString()}</small>
                </div>
                ${isOwnComment ? `<button class="delete-comment-btn" data-comment-id="${comment.id}">削除</button>` : ''}
            `;
            
            // 削除ボタンのイベントリスナーを追加
            const deleteBtn = item.querySelector('.delete-comment-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteComment(comment.id);
                });
            }
            
            this.elements.commentsList.appendChild(item);
        });
    }

    getCurrentUserId() {
        let userId = localStorage.getItem('radioAppUserId');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('radioAppUserId', userId);
        }
        return userId;
    }

    async sendComment() {
        const name = this.elements.commentName.value.trim();
        const text = this.elements.commentText.value.trim();
        if (!text || !this.currentCommentEpisode) return;
        
        const newComment = {
            id: 'comment_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            text: text,
            author: name || '匿名',
            date: new Date().toISOString(),
            userId: this.getCurrentUserId()
        };
        
        if (!this.currentCommentEpisode.comments) {
            this.currentCommentEpisode.comments = [];
        }
        this.currentCommentEpisode.comments.push(newComment);
        
        this.renderComments(this.currentCommentEpisode.comments);
        this.updateCommentCount(this.currentCommentEpisode.id, this.currentCommentEpisode.comments.length);
        
        // Clear form and close modal
        this.elements.commentName.value = '';
        this.elements.commentText.value = '';
        this.hideCommentModal();
        
        // コメント機能はメール通知なし
    }

    async deleteComment(commentId) {
        if (!confirm('このコメントを削除しますか？')) {
            return;
        }

        try {
            const response = await fetch('https://radio-app-r2-uploader.str-radio.workers.dev/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Action': 'delete_comment'
                },
                body: JSON.stringify({
                    episodeId: this.currentCommentEpisode.id,
                    commentId: commentId,
                    userId: this.getCurrentUserId()
                })
            });

            if (!response.ok) {
                throw new Error('コメントの削除に失敗しました');
            }

            // ローカルのコメントからも削除
            this.currentCommentEpisode.comments = this.currentCommentEpisode.comments.filter(
                comment => comment.id !== commentId
            );
            
            this.renderComments(this.currentCommentEpisode.comments);
            this.updateCommentCount(this.currentCommentEpisode.id, this.currentCommentEpisode.comments.length);
            
        } catch (error) {
            console.error('Delete comment error:', error);
            alert('コメントの削除に失敗しました: ' + error.message);
        }
    }
    
    updateCommentCount(episodeId, count) {
        const commentCount = document.querySelector(`.comment-btn[data-episode-id="${episodeId}"] .comment-count`);
        if (commentCount) {
            commentCount.textContent = count;
        }
    }
    
    async sendLetter() {
        const name = this.elements.letterName.value.trim();
        const subject = this.elements.letterSubject.value.trim();
        const text = this.elements.letterText.value.trim();
        
        if (!name || !subject || !text || !this.currentLetterEpisode) {
            alert('すべての項目を入力してください。');
            return;
        }
        
        const episode = this.currentLetterEpisode;
        const newLetter = {
            id: String(Date.now()),
            episodeId: episode.id,
            episodeTitle: episode.title,
            senderName: name,
            subject: subject,
            message: text,
            date: new Date().toISOString(),
            isRead: false
        };
        
        // ローカルストレージにレターを保存
        const letters = JSON.parse(localStorage.getItem('radioAppLetters') || '[]');
        letters.push(newLetter);
        localStorage.setItem('radioAppLetters', JSON.stringify(letters));
        
        // フォームをクリアしてモーダルを閉じる
        this.hideLetterModal();
        
        // 送信完了メッセージ
        alert('レターを送信しました。管理者が確認いたします。ありがとうございます！');
    }

    setView(view) {
        localStorage.setItem('preferredView', view);
        this.applyPreferredView();
    }

    filterAndSortEpisodes(filter) {
        // ボタンのアクティブ状態を更新
        this.elements.filterButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        let sortedEpisodes = [...this.episodes];

        switch (filter) {
            case 'recent':
                sortedEpisodes.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
                break;
            case 'popular':
                sortedEpisodes.sort((a, b) => (b.likes || 0) - (a.likes || 0));
                break;
            case 'all':
            default:
                 // デフォルト（jsonの並び順）に戻すため、元の配列をソート
                sortedEpisodes.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
                break;
        }

        this.renderEpisodes(sortedEpisodes);
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
    app.handleURLParameters(); // URLパラメータを処理
    initServiceWorker();
});
