// @ts-nocheck
/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';
const utils = require('@iobroker/adapter-core');
const cache = require('./lib/cache');
const ownUtils = require('./lib/utils');

const querystring = require('querystring');
const _request = require('request');
const { time } = require('console');
const { format } = require('path');

function request(options) {
    return new Promise((resolve, reject) =>
        _request(options, (error, status) => error ? reject(error) : resolve(status)));
}

let adapter;
let isEmpty = ownUtils.isEmpty;
let removeNameSpace = ownUtils.removeNameSpace;

let artistImageUrlCache = {};
let playlistInfoCache = {};
let playlistAppCache = [];
let plAppCacheReload = false; //nur 1x alle 15min (pollPlaylistApi)
let albumCache = {};

let application = {
    userId: '',
    baseUrl: 'https://api.spotify.com',
    clientId: '',
    clientSecret: '',
    deleteDevices: false,
    deletePlaylists: false,
    keepShuffleState: true,
    redirect_uri: 'http://localhost',
    token: '',
    refreshToken: '',
    code: '',
    statusInternalTimer: null, //progress and duration refresh between statusPoll-interval
    requestPollingHandle: null,
    statusPollingHandle: null, //status-Info 5s or 30s
    statusPlayPollingDelaySeconds: 5,
    statusPollingDelaySeconds: 30,
    devicePollingHandle: null,
    devicePollingDelaySeconds: 300,
    playlistPollingHandle: null,
    playlistPollingDelaySeconds: 900,
    albumPollingHandle: null,
    albumPollingDelaySeconds: 900,
    showPollingHandle: null,
    showPollingDelaySeconds: 900,
    error202shown: false,
    cacheClearHandle: null
};

let deviceData = {
    lastActiveDeviceId: '',
    lastSelectDeviceId: ''
};
let stopped = false;
let showStarted = false; //keine play-Erkennung bei playbackInfo für Show/Episode
let lastPlayingShow = {
    lastShowId: '',
    lastEpisodeId: '',
    lastEpisodeNo: 0,
    lastEpisodeDuration_ms: 0
};
let currentPlayingType = ''; //enthält aktuellen Play-type playlist, album...
let RequestCount = 0; //Zähler für Requests /min (too many Request error)
let doNotTestSnapshotId = false; //für getCurrentPlaylist Abfrage der Playlist/PlayTrack-Daten bei play=true (nur button)
let doNotTestAlbum = false; //für Abfrage durch getAlbums-button - keine Prüfung der alten Werte (alle daten neu laden)
let pl_foundCount = 0;
let pl_notFoundCount = 0;
let playlistComplete = false; //verhindert das löschen der playlists bei fehlerhaften request-Daten
let albumComplete = false;
let showComplete = false;
let isAuth = false;
let trackIsFav = false;
let lastTrackId = '';
let isPlaying = false;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: 'spotify-premium',
        stateChange: (id, state) => cache.setExternal(id, state),
        objectChange: (id, obj) => cache.setExternalObj(id, obj),
        ready: () => {
            cache.on('authorization.authorizationReturnUri', listenOnAuthorizationReturnUri, true);
            cache.on('authorization.getAuthorization', listenOnGetAuthorization);
            cache.on('authorization.authorized', listenOnAuthorized);
            cache.on(/\.useForPlayback$/, listenOnUseForPlayback, true);
            cache.on(/\.trackList$/, listenOnTrackList, true);
            cache.on(/\.playThisShow$/, listenOnPlayThisShow);
            cache.on(/\.playThisList$/, listenOnPlayThisList);
            cache.on(/\.playThisListTrackId$/, listenOnTrackId,true);
            cache.on(/\.playThisAlbum$/, listenOnPlayThisAlbum);
            cache.on(/\.episodeList$/, listenOnEpisodeList, true);
            cache.on(/\.albumList$/, listenOnAlbumList, true);
            cache.on('devices.deviceList', listenOnDeviceList, true);
            cache.on('playlists.playlistList', listenOnPlaylistList, true);
            cache.on('shows.showList', listenOnShowList, true);
            cache.on('albums.albumList', listenOnAlbumList, true);
            cache.on('player.play', listenOnPlay);
            cache.on('player.addFavorite', listenOnAddFavorite);
            cache.on('player.delFavorite', listenOnDelFavorite);
            cache.on('player.playUri', listenOnPlayUri);
            cache.on('player.setUriToQueue', listenOnUriToQueue);
            cache.on('player.pause', listenOnPause);
            cache.on('player.skipPlus', listenOnSkipPlus);
            cache.on('player.skipMinus', listenOnSkipMinus);
            cache.on('player.repeat', listenOnRepeat, adapter.config.defaultRepeat || 'context');
            cache.on('player.repeatTrack', listenOnRepeatTrack);
            cache.on('player.repeatContext', listenOnRepeatContext);
            cache.on('player.repeatOff', listenOnRepeatOff);
            cache.on('player.volume', listenOnVolume, true);
            cache.on('player.progressMs', listenOnProgressMs, true);
            cache.on('player.progressPercentage', listenOnProgressPercentage, true);
            cache.on('player.shuffle', listenOnShuffle, adapter.config.defaultShuffle || 'on');
            cache.on('player.shuffleOff', listenOnShuffleOff);
            cache.on('player.shuffleOn', listenOnShuffleOn);
            cache.on('player.trackId', listenOnTrackId, true);
            cache.on('player.episodeId', listenOnEpisodeId, true);
            cache.on('player.playlist.id', listenOnPlaylistId, true);
            cache.on('player.album.id', listenOnAlbumId, true);
            cache.on('player.playlist.owner', listenOnPlaylistOwner, true);
            cache.on('player.playlist.trackNo', listenOnPlaylistTrackNo, true);
            cache.on('player.album.trackNo', listenOnAlbumTrackNo, true);
            cache.on('player.show.episodeNo', listenOnShowTrackNo, true);
            cache.on('loadPlaylistCache', loadPlaylistAppCache);
            cache.on('getShows', reloadUsersShows);
            cache.on('getAlbums', reloadUsersAlbumBtn);
            cache.on('getPlaylists', reloadUsersPlaylistNoTest); //get UsersPlaylists without testing snapshotId
            cache.on('getCollection', getUsersCollection);
            cache.on('checkTrackInCollection', checkForTrackInCollection);
            cache.on('getCurrentPlaylist', getCurrentPlaylist); //get currently playing playlist
            cache.on('getPlaybackInfo', listenOnGetPlaybackInfo);
            cache.on('getDevices', listenOnGetDevices);
            cache.on('loadQueue', btnLoadQueue);
            cache.on('clearCache', btnClearCache);
            cache.on('refreshPlaylistList', btnRefreshPlaylistList); //clear lists first
            cache.on('refreshDeviceList', btnRefreshDeviceList); //clear list first
            cache.on('refreshAlbumList', btnRefreshAlbumList); //clear list first
            cache.on('refreshShowList', btnRefreshShowList); //clear list first
            cache.on('activateLastDevice', transferPlaybackNoPlay);
            cache.on('unfollowPlaylistId', listenOnUnfollowPlaylist, true);
            cache.on('unfollowAlbumId', listenOnUnfollowAlbum, true);
            cache.on('unfollowShowId', listenOnUnfollowShow, true);
            cache.on('getTrackInfoTrackId', listenOnGetTrackInfo, true);
            cache.on('getArtistInfoArtistId', listenOnGetArtistInfo, true);
            cache.on('setToFavorite', listenOnSetToFavorite, true);
            cache.on('unsetFromFavorite', listenOnUnsetFromFavorite, true);
            cache.on('refreshThisPlaylist', refreshThisPlaylist, true);
            cache.on(['playlists.playlistList', 'playlists.playlistListIds', 'playlists.playlistListString'], listenOnHtmlPlaylists);
            cache.on(['player.playlist.trackList', 'player.playlist.trackListArray'], listenOnHtmlTracklist);
            cache.on(['devices.deviceList', 'devices.deviceListIds', 'devices.availableDeviceListString'], listenOnHtmlDevices);

            cache.init()
                .then(() => main());
        },
        unload: callback => {
            stopped = true;
            showStarted = false;
            if ('undefined' !== typeof application.statusPollingHandle) {
                clearTimeout(application.statusPollingHandle);
                clearTimeout(application.statusInternalTimer);
            }
            if ('undefined' !== typeof application.devicePollingHandle) {
                clearTimeout(application.devicePollingHandle);
            }
            if ('undefined' !== typeof application.playlistPollingHandle) {
                clearTimeout(application.playlistPollingHandle);
            }
            if ('undefined' !== typeof application.albumPollingHandle) {
                clearTimeout(application.albumPollingHandle);
            }
            if ('undefined' !== typeof application.showPollingHandle) {
                clearTimeout(application.showPollingHandle);
            }
            if ('undefined' !== typeof application.requestPollingHandle) {
                clearTimeout(application.requestPollingHandle);
            }
            if ('undefined' !== typeof application.cacheClearHandle) {
                clearTimeout(application.cacheClearHandle);
            }
            Promise.all([
                /*cache.setValue('player.trackId', ''),
                cache.setValue('player.albumId', ''),
                cache.setValue('player.episodeId', ''),
                cache.setValue('player.playlist.id', ''),
                cache.setValue('player.playlist.trackNo', 0),
                cache.setValue('player.playlist.owner', ''),*/
                cache.setValue('authorization.authorizationUrl', ''),
                cache.setValue('authorization.authorizationReturnUri', ''),
                cache.setValue('authorization.userId', ''),
                cache.setValue('authorization.authorized', false),
                cache.setValue('info.connection', false)
            ]).then(() => {
                callback();
            });
        }
    });

    adapter = new utils.Adapter(options);
    cache.setAdapter(adapter);
    ownUtils.setAdapter(adapter);

    return adapter;
}

function main() {
    application.clientId = adapter.config.client_id;
    application.clientSecret = adapter.config.client_secret;
    application.deleteDevices = adapter.config.delete_devices;
    application.deletePlaylists = adapter.config.delete_playlists;
    application.statusPollingDelaySeconds = adapter.config.status_interval;
    application.statusPlayPollingDelaySeconds = adapter.config.status_play_interval;
    application.keepShuffleState = adapter.config.keep_shuffle_state;
    let deviceInterval = adapter.config.device_interval;
    let playlistInterval = adapter.config.playlist_interval;
    let albumInterval = adapter.config.album_interval;
    let showInterval = adapter.config.show_interval;
    if (isEmpty(application.clientId)) {
        return adapter.log.error('Client_ID is not filled');
    }
    if (isEmpty(application.clientSecret)) {
        return adapter.log.error('Client_Secret is not filled');
    }
    if (isEmpty(application.deleteDevices)) {
        application.deleteDevices = false;
    }
    if (isEmpty(application.deletePlaylists)) {
        application.deletePlaylists = false;
    }
    if (isEmpty(application.keepShuffleState)) {
        application.keepShuffleState = false;
    }
    if (isEmpty(application.statusPlayPollingDelaySeconds)) {
        application.statusPlayPollingDelaySeconds = 5;
    } else if ((application.statusPollingDelaySeconds < 1 && application.statusPollingDelaySeconds) || (application.statusPlayPollingDelaySeconds < 1 && 
            application.statusPlayPollingDelaySeconds)) {
        application.statusPollingDelaySeconds = 0;
        application.statusPlayPollingDelaySeconds = 0;
    }
    //wenn statusPolling oder statusPlayPolling deaktiviert beide auf 0 setzen
    if (isEmpty(application.statusPollingDelaySeconds)) {
        application.statusPollingDelaySeconds = 30;
    } else if ((application.statusPollingDelaySeconds < 1 && application.statusPollingDelaySeconds) || (application.statusPlayPollingDelaySeconds < 1 && 
            application.statusPlayPollingDelaySeconds)) {
        application.statusPollingDelaySeconds = 0;
        application.statusPlayPollingDelaySeconds = 0;
    }
    if (isEmpty(deviceInterval)) {
        deviceInterval = 0;
    }
    if (isEmpty(playlistInterval)) {
        playlistInterval = 0;
    }
    if (isEmpty(albumInterval)) {
        albumInterval = 0;
    }
    if (isEmpty(showInterval)) {
        showInterval = 0;
    }

    application.devicePollingDelaySeconds = deviceInterval * 60;
    application.playlistPollingDelaySeconds = playlistInterval * 60;
    application.albumPollingDelaySeconds = albumInterval * 60;
    application.showPollingDelaySeconds = showInterval * 60;
    adapter.subscribeStates('*');
    start();
}

function start() {
    clearCache();
    loadPlaylistAppCache();

    return readTokenStates()
        .then(tokenObj => {
            application.token = tokenObj.accessToken;
            application.refreshToken = tokenObj.refreshToken;
        })
        .then(() => sendRequest('/v1/me', 'GET', ''))
        .then(data => setUserInformation(data))
        .then(() => Promise.all([
            cache.setValue('authorization.authorized', true),
            cache.setValue('info.connection', true)
        ]))
        .then(() => listenOnGetPlaybackInfo().catch(() => {}))
        .then(() => reloadUsersPlaylist().catch(() => {}))
        .then(() => reloadUsersAlbums().catch(() => {}))
        .then(() => reloadUsersShows().catch(() => {}))
        .then(() => getCollectionTracks().catch(() => {}))
        .then(() => listenOnGetDevices().catch(() => {}))
        .catch(err => {
            adapter.log.warn(err);

            return Promise.all([
                cache.setValue('authorization.authorized', false),
                cache.setValue('info.connection', false)
            ]);
        });
}

function readTokenStates() {
    let state = cache.getValue('authorization.token');

    if (state) {
        let tokenObj = state.val;
        if (typeof tokenObj === 'string') {
            try {
                tokenObj = JSON.parse(tokenObj);
            } catch (e) {

            }
        }
        let validAccessToken  = !isEmpty(loadOrDefault(tokenObj, 'accessToken', ''));
        let validRefreshToken = !isEmpty(loadOrDefault(tokenObj, 'refreshToken', ''));
        let validClientId     = !isEmpty(loadOrDefault(tokenObj, 'clientId', '')) && tokenObj.clientId === application.clientId;
        let validClientSecret = !isEmpty(loadOrDefault(tokenObj, 'clientSecret', '')) && tokenObj.clientSecret === application.clientSecret;

        if (validAccessToken && validRefreshToken && validClientId && validClientSecret) {
            adapter.log.debug('spotify token read');
            return Promise.resolve(tokenObj);
        } else {
            return Promise.reject('invalid or no spotify token');
            // return getToken();
        }
    } else {
        return Promise.reject('invalid or no spotify token');
        // return getToken();
    }
}

function sendRequest(endpoint, method, sendBody, delayAccepted) {  
    RequestCount += 1;
    let options = {
        url: application.baseUrl + endpoint,
        method,
        headers: {
            Authorization: 'Bearer ' + application.token
        },
        form: sendBody
    };
    adapter.log.debug(`spotify api call... ${endpoint}; ${options.form}`);
    let callStack = new Error().stack;
    adapter.setState('authorization.error', '', true);

    return request(options)
        .then(response => {
            let body = response.body;
            let ret;
            let parsedBody;
            try {
                parsedBody = JSON.parse(body);
            } catch (e) {
                parsedBody = {
                    error: {
                        message: 'no active device'
                    }
                };
            }
            switch (response.statusCode) {
                case 200:
                    // OK
                    ret = parsedBody;
                    break;
                case 202:
                    // Accepted, processing has not been completed.
                    adapter.log.debug('http response: ' + JSON.stringify(response));
                    if (delayAccepted) {
                        ret = null;
                    } else {
                        ret = Promise.reject(response.statusCode);
                    }
                    break;
                case 204:
                    // OK, No Content
                    ret = null;
                    break;
                case 400:
                // Bad Request, message body will contain more
                // information
                case 500:
                // Server Error
                case 503:
                // Service Unavailable
                case 504:
                // GatewayTimeout
                case 404:
                // Not Found
                case 408:
                //current geographical location missmatch
                case 502:
                    // Bad Gateway
                    ret = Promise.reject(response.statusCode);
                    break;
                case 403:
                case 401:
                    // Unauthorized
                    if (parsedBody.error.message === 'The access token expired') {
                        adapter.log.debug('access token expired!');
                        ret = Promise.all([
                            cache.setValue('authorization.authorized', false),
                            cache.setValue('info.connection', false)
                        ])
                            .then(() => refreshToken())
                            .then(() => Promise.all([
                                cache.setValue('authorization.authorized', true),
                                cache.setValue('info.connection', true)
                            ]))
                            .then(() => sendRequest(endpoint, method, sendBody))
                            .then((data) => {
                                // this Request get the data which requested with the old token
                                adapter.log.debug('data with new token');
                                return data;
                            })
                            .catch(err => {
                                if (err === 202) {
                                    adapter.log.debug(err + ' request accepted but no data, try again');
                                } else {
                                    adapter.log.error('error on request data again. ' + err);
                                }
                                return Promise.reject(err);
                            });
                    } else {
                        if (response.statusCode === 403) {
                            adapter.log.warn('Seems that the token is expired!');
                            adapter.log.warn('status code: ' + response.statusCode);
                            adapter.log.warn('body: ' + body);
                        }


                        // if other error with code 401
                        ret = Promise.all([
                            cache.setValue('authorization.authorized', false),
                            cache.setValue('info.connection', false)
                        ])
                            .then(() => {
                                adapter.log.error(parsedBody.error.message);
                                return Promise.reject(response.statusCode);
                            });
                    }
                    break;

                case 429:
                    // Too Many Requests > 30 requests/minute
                    let wait = 1;
                    let stopPolling = false;
                    if (response.headers.hasOwnProperty('retry-after') && response.headers['retry-after'] > 0) {
                        wait = response.headers['retry-after'];
                        adapter.log.warn('too many requests, should wait ' + wait + 's');
                        stopPolling = true;
                        clearTimeout(application.statusInternalTimer);
                        wait = 60;
                    }
                    ret = new Promise(resolve => setTimeout(() => !stopped && resolve(), wait * 1000))
                        .then(() => {
                            if (stopPolling) {
                                scheduleStatusPolling();
                            }
                            sendRequest(endpoint, method, sendBody, delayAccepted);
                        });
                                      
                    break;

                default:
                    adapter.log.warn('http request error not handled, please debug');
                    adapter.log.debug('status code: ' + response.statusCode);
                    adapter.log.warn(callStack);
                    adapter.log.warn(new Error().stack);
                    adapter.log.debug('body: ' + body);
                    ret = Promise.reject(response.statusCode);
                    adapter.setState('authorization.error', body, true);
            }
            return ret;
        });

}

function loadOrDefault(obj, name, defaultVal) {
    let t;
    try {
        const f = new Function('obj', 'name', 'return obj.' + name);
        t = f(obj, name);
    } catch (e) {
        if (!obj) {
            console.error(e);
        }

    }
    if (t === undefined) {
        t = defaultVal;
    }
    return t;
}

function createOrDefault(obj, name, state, defaultVal, description, type, states) {
    let t = loadOrDefault(obj, name, defaultVal);
    let object = {
        type: 'state',
        common: {
            name: description,
            type,
            role: 'value',
            write: false,
            read: true
        },
        native: {}
    };
    if (!isEmpty(states)) {
        object.states = states;
    }
    return cache.setValue(state, t, object);
}

function setOrDefault(obj, name, state, defaultVal) {
    let t = loadOrDefault(obj, name, defaultVal);
    return cache.setValue(state, t);
}

function shrinkStateName(v) {
    if (isEmpty(v)) {
        return 'onlySpecialCharacters';
    }
    let n = v.replace(/[\s."`'*,\\?<>[\];:]+/g, '');
    if (isEmpty(n)) {
        n = 'onlySpecialCharacters';
    }
    return n;
}

function getArtistArrayOrDefault(data, name) {
    let ret = [];
    for (let i = 0; i < 100; i++) {
        let artistName = loadOrDefault(data, `${name}[${i}].name`, '');
        let artistId = loadOrDefault(data, `${name}[${i}].id`, '');
        if (!isEmpty(artistName) && !isEmpty(artistId)) {
            ret.push({id: artistId, name: artistName});
        } else {
            break;
        }
    }
    return ret;
}

function getArtistNamesOrDefault(data, name) {
    let ret = '';
    for (let i = 0; i < 100; i++) {
        let artist = loadOrDefault(data, `${name}[${i}].name`, '');
        if (!isEmpty(artist)) {
            if (i > 0) {
                ret += ', ';
            }
            ret += artist;
        } else {
            break;
        }
    }
    return ret;
}

function setObjectStatesIfChanged(id, states) {
    let obj = cache.getObj(id);
    if (obj == null) {
        obj = {
            common: {
                name: '',
                type: 'string',
                role: 'value',
                states: null,
                read: true,
                write: true
            },
            type: 'state'
        };
    }

    return cache.setValue(id, null, {
        type: obj.type,
        common: {
            name: obj.common.name,
            type: obj.common.type,
            role: obj.common.role,
            states,
            read: obj.common.read,
            write: obj.common.write
        },
        native: {}
    });
}

function copyState(src, dst) {
    //return cache.setValue(dst, cache.getValue(src).val);
    let tmp_src = cache.getValue(src);
    if (tmp_src) {
        return cache.setValue(dst, tmp_src.val);
    } else {
        adapter.log.debug("copyState: wrong data src");
        return;
    }
}

function copyObjectStates(src, dst) {
    //return setObjectStatesIfChanged(dst, cache.getObj(src).common.states);
    let tmp_src = cache.getObj(src);
    if (tmp_src && tmp_src.common) {
        return setObjectStatesIfChanged(dst, tmp_src.common.states);
    } else {
        adapter.log.debug("copyObjectStates: wrong data src");
        return;
    }
}

async function getCurrentlyPlayingType(playType) {
    //Ergänzung zu createPlaybackInfo speziell für episode
    const retObj = {
        showId: '',
        episodeId: '',
        durationMs: 0,
        name: '',
        publisher: '',
        description: '',
        total_episodes: 0
    };
    if (!isEmpty(playType)) {
        let query = {
            additional_types: playType
        };
        try {
            const data = await sendRequest(`/v1/me/player/currently-playing?${querystring.stringify(query)}`, 'GET', '');
            if (!isEmpty(data)) {
                //adapter.log.warn('data: ' + JSON.stringify(data));
                retObj.description = loadOrDefault(data, 'item.show.description', '');
                retObj.durationMs = loadOrDefault(data, 'item.duration_ms', 0);
                retObj.episodeId = loadOrDefault(data, 'item.id', '');
                retObj.name = loadOrDefault(data, 'item.show.name', '');
                retObj.publisher = loadOrDefault(data,'item.show.publisher', '');
                retObj.showId = loadOrDefault(data, 'item.show.id', '');
                retObj.total_episodes = loadOrDefault(data, 'item.show.total_episodes', 0);
            }
        } catch(err) {
            adapter.log.warn('getCurrentlyPlayingType err: ' + err);
        }
    }
    //adapter.log.warn('return: ' + ret);
    return retObj;
}

function createPlaybackInfo(data) {
    //Aufruf von (pollStatusApi)...sendRequest('/v1/me/player', 'GET', '')...
    if (isEmpty(data)) {
        data = {};
    }
    let deviceId = loadOrDefault(data, 'device.id', '');
    let isDeviceActive = loadOrDefault(data, 'device.is_active', false);
    let isDeviceRestricted = loadOrDefault(data, 'device.is_restricted', false);
    let deviceName = loadOrDefault(data, 'device.name', '');
    let deviceType = loadOrDefault(data, 'device.type', '');
    let deviceVolume = loadOrDefault(data, 'device.volume_percent', 100);
    isPlaying = loadOrDefault(data, 'is_playing', false);
    let duration = loadOrDefault(data, 'item.duration_ms', 0);
    let type = '';
    let ctype = loadOrDefault(data, 'context.type', '');
    let itype = loadOrDefault(data, 'item.type', '');
    let popularity = loadOrDefault(data, 'item.popularity', 0);
    let currently_playing_type = loadOrDefault(data, 'currently_playing_type', '');
    if (!isPlaying) {
        showStarted = false;
    }
    if (ctype && !isEmpty(ctype)){
        type = ctype;
    } else if (itype && isEmpty(ctype) && !isEmpty(itype)) {
        type = itype;
    } else if (isEmpty(itype) && !isEmpty(currently_playing_type)) {
        type = currently_playing_type;
    }
    if (isEmpty(type) && !isEmpty(currentPlayingType)) {
        type = currentPlayingType;
    }
    if (!isEmpty(currentPlayingType) && (currentPlayingType === 'episode' || currentPlayingType === 'show')) {
        type = currentPlayingType;
    }
    cache.setValue('player.type', type);
    cache.setValue('player.ctype', ctype);
    cache.setValue('player.itype', itype);
    cache.setValue('player.currentlyPlayingType', currently_playing_type);
    //adapter.log.warn('playbackInfo type: ' + type);
    let progress = loadOrDefault(data, 'progress_ms', 0);
    let progressPercentage = 0;

    let contextDescription = '';
    let contextImage = '';
    let album = loadOrDefault(data, 'item.album.name', '');
    let albumId = loadOrDefault(data, 'item.album.id', '');
    let albumUrl = loadOrDefault(data, 'item.album.images[0].url', '');
    let albumUrl64 = loadOrDefault(data, 'item.album.images[2].url', '');
    let artist = getArtistNamesOrDefault(data, 'item.artists');
    let albumArtistName = loadOrDefault(data, 'item.album.artists[0].name','');
    let shuffle = loadOrDefault(data, 'shuffle_state', false);
    let repeat = loadOrDefault(data, 'repeat_state', adapter.config.defaultRepeat);
    let trackId = loadOrDefault(data, 'item.id', '');
    let showId = '';
    let episodeId = '';
    let episodeNo = 0; 

    if (type === 'album') {
        contextDescription = 'Album: ' + album;
        contextImage = albumUrl;
    } else if (type === 'artist') {
        contextDescription = 'Artist: ' + artist;
    } else if (type === 'track') {
        contextDescription = 'Track';
        // tracks has no images
        contextImage = albumUrl;
    } else if ( type === 'collection') {
        contextDescription = 'favorite Songs';
        contextImage = albumUrl;
    } else if ( type === 'episode' || type === 'show') {
        //episode has no images
        let stateImg = cache.getValue('player.show.imageUrl');      
        contextImage = loadOrDefault(stateImg, 'val', '');
    }
    if (duration > 0) {
        progressPercentage = Math.floor(progress / duration * 100);
    }
    //Abfrage ob player isPlaying, sonst isPlaying schreiben und raus aus function
    if (isPlaying) {
        //adapter.log.warn('device wird geschrieben');
        return Promise.all([
            cache.setValue('player.device.id', deviceId),
            cache.setValue('player.device.isActive', isDeviceActive),
            cache.setValue('player.device.isRestricted', isDeviceRestricted),
            cache.setValue('player.device.name', deviceName),
            cache.setValue('player.device.type', deviceType),
            cache.setValue('player.device.volume', {val: deviceVolume, ack: true}),
            cache.setValue('player.device.isAvailable', !isEmpty(deviceName)),
            cache.setValue('player.device', null, {
                type: 'device',
                common: {
                    name: (isEmpty(deviceName) ? 'Commands to control playback related to the current active device' : deviceName),
                    icon: getIconByType(deviceType)
                },
                native: {}
            })
        ])
        .then(() => {
            if (deviceName) {
                deviceData.lastActiveDeviceId = deviceId;
                let states = cache.getValue('devices.*');

                let keys = Object.keys(states);
                let fn = function (key) {
                    if (!key.endsWith('.isActive')) {
                        return;
                    }
                    key = removeNameSpace(key);
                    let name = '';
                    if (deviceId != null) {
                        name = shrinkStateName(deviceId);
                    } else {
                        name = shrinkStateName(deviceName);
                    }
                    if (key !== `devices.${name}.isActive`) {
                        return cache.setValue(key, false);
                    }
                };
                return Promise.all(keys.map(fn))
                    .then(() => createDevices({
                            devices: [{
                                id: deviceId,
                                is_active: isDeviceActive,
                                is_restricted: isDeviceRestricted,
                                name: deviceName,
                                type: deviceType,
                                volume_percent: deviceVolume
                            }]
                        }))
                    .then(() => refreshDeviceList());
            } else {
                let states = cache.getValue('devices.*');
                let keys = Object.keys(states);
                let fn = function (key) {
                    if (!key.endsWith('.isActive')) {
                        return;
                    }
                    key = removeNameSpace(key);
                    return cache.setValue(key, false);
                };
                return Promise.all(keys.map(fn));
            }
        })
        .then(() => {
            //abfrage nach type ergänzt episode separat (anderer Datenstruktur)
            if (type === 'track' || type === 'playlist' || type === 'album' || type === 'artist' || type === 'collection') {
                //prüfe trackInFavorite (1x abfragen/trackid-wechsel ! err 429 !)
                if (!isEmpty(trackId) && (lastTrackId === '' || lastTrackId !== trackId)) {
                    adapter.log.debug('createPlaybackInfo->checkTrackInCollection');
                    checkTrackInCollection(trackId);
                    lastTrackId = trackId;
                }
                //allgemein artists generieren
                let artists = [];
                for (let i = 0; i < 100; i++) {
                    let id = loadOrDefault(data, `item.artists[${i}].id`, '');
                    if (isEmpty(id)) {
                        break;
                    } else {
                        artists.push(id);
                    }
                }
                let urls = [];
                let fn = function (artist) {
                    if (artistImageUrlCache.hasOwnProperty(artist)) {
                        urls.push(artistImageUrlCache[artist]);
                    } else {
                        return sendRequest('/v1/artists/' + artist, 'GET', '')
                            .then(parseJson => {
                                let url = loadOrDefault(parseJson, 'images[0].url', '');
                                if (!isEmpty(url)) {
                                    artistImageUrlCache[artist] = url;
                                    urls.push(url);
                                }
                            });
                    }
                };
                return Promise.all(artists.map(fn))
                    .then(() => {
                        let set = '';
                        if (urls.length !== 0) {
                            set = urls[0];
                        }
                        if (type === 'artist') {
                            contextImage = set;
                        }
                        return cache.setValue('player.artistImageUrl', set);
                    })
                .then(() => {
                    //allgemeine Player-Infos bei track, album, playlist, collection, artist
                    return Promise.all([
                        cache.setValue('player.albumId', albumId),
                        cache.setValue('player.isPlaying', isPlaying),
                        setOrDefault(data, 'item.id', 'player.trackId', ''),
                        cache.setValue('player.artistName', artist),
                        cache.setValue('player.artistImgUrlArray', urls),
                        cache.setValue('player.albumImageUrl', albumUrl),
                        cache.setValue('player.albumImageUrl64', albumUrl64),
                        setOrDefault(data, 'item.name', 'player.trackName', ''),
                        cache.setValue('player.durationMs', duration),
                        cache.setValue('player.duration', convertToDigiClock(duration)),
                        cache.setValue('player.type', type),
                        cache.setValue('player.progressMs', progress),
                        cache.setValue('player.progressPercentage', progressPercentage),
                        cache.setValue('player.progress', convertToDigiClock(progress)),
                        cache.setValue('player.shuffle', (shuffle ? 'on' : 'off')),
                        cache.setValue('player.trackIsFavorite', trackIsFav),
                        setOrDefault(data, 'repeat_state', 'player.repeat', adapter.config.defaultRepeat),
                        setOrDefault(data, 'device.volume_percent', 'player.device.volume', 100)
                    ]);
                })
                .then(() => {
                    //spezielle Info's nach type
                    if (type === 'playlist') {
                        playlistInfoCache = {};
                        let uri = loadOrDefault(data, 'context.uri', '');
                        if (!isEmpty(uri) || !isPlaying) {
                            let indexOfUser = uri.indexOf('user:');
                            if (indexOfUser >= 0) {
                                indexOfUser = indexOfUser + 5;
                            }
                            let endIndexOfUser = uri.indexOf(':', indexOfUser);
                            let indexOfPlaylistId = uri.indexOf('playlist:');
                            if (indexOfPlaylistId >= 0) {
                                indexOfPlaylistId = indexOfPlaylistId + 9;
                            }
                            let playlistId = uri.substring(indexOfPlaylistId);
                            //adapter.log.warn('ermittelt playlistId: ' + playlistId);
                            let ownerId = uri.substring(indexOfUser, endIndexOfUser);
                            // !!!--> bei (playlistOwner)user !== spotify kein user: in uri <--!!!
                            let idLstState = cache.getValue('playlists.playlistListIds');
                            if (indexOfUser < 0){
                                //suche owner erst in playlistListIds dann unter playlists.*.owner auslesen (kann sonderzeichen enthalten!)
                                if (idLstState && idLstState.val && !isEmpty(idLstState.val)) {
                                    let idLst = idLstState.val.split(';');
                                    for (let i = 0; i < idLst.length; i++){
                                        let _idOwner = idLst[i].split('-');
                                        if (_idOwner[1] === playlistId) {
                                            let pl_tmpState = cache.getValue('playlists.' + idLst[i] + '.owner');
                                            if (pl_tmpState && pl_tmpState.val) {
                                                ownerId = pl_tmpState.val;
                                            }
                                            break;
                                        } 
                                    }
                                }
                            }
                            let clearPrefix = shrinkStateName(ownerId + '-' + playlistId);
                            //adapter.log.warn('getPlaylistCacheItem erreicht owner: ' + ownerId + ' plId: '+ playlistId);
                            let pl_ix = getPlaylistCacheItem(ownerId, playlistId);
                            let plCacheItem = playlistAppCache[pl_ix];
                            if (plCacheItem) {
                                playlistInfoCache[clearPrefix] = {
                                    id: playlistId,
                                    name: plCacheItem.name,
                                    snapshot_id: plCacheItem.snapshot_id,
                                    images: [{url: plCacheItem.image}, {}, {url: plCacheItem.image64}],
                                    owner: {id: plCacheItem.owner},
                                    tracks: {total: plCacheItem.tracksTotal}
                                };
                            } else {
                                //alle 10s !
                                if (idLstState && idLstState.val && idLstState.val.length > 0 && !plAppCacheReload){
                                    //versuche nachladen playlistAppCache
                                    //kann vorkommen wenn spotify-play schon aktiv während adapter-start
                                    loadPlaylistAppCache();
                                    plAppCacheReload = true; // nur 1x alle 15min (pollPlaylistApi)
                                } else {
                                    adapter.log.debug('no playlist in playlistAppCache or playlist not found');
                                }
                            }
                        
                            let playlistName = loadOrDefault(playlistInfoCache[clearPrefix], 'name', '');
                            contextDescription = 'Playlist: ' + playlistName;
                            let playlistImage = loadOrDefault(playlistInfoCache[clearPrefix], 'images[0].url', '');
                            contextImage = playlistImage;
                            let pl_ownerId = loadOrDefault(playlistInfoCache[clearPrefix], 'owner.id', '');
                            let trackCount = loadOrDefault(playlistInfoCache[clearPrefix], 'tracks.total', '');
                            let snapshot_id = loadOrDefault(playlistInfoCache[clearPrefix], 'snapshot_id', '');
                            if (isEmpty(ownerId)) {
                                if (!isEmpty(pl_ownerId)) {
                                    ownerId = pl_ownerId;
                                }
                            }
                            //adapter.log.warn('erstelle playlistInfoCache ownerId ' + ownerId + ' plId: ' + playlistId);
                            const trackList = cache.getValue(`playlists.${clearPrefix}.trackList`);

                            return Promise.all([
                                cache.setValue('player.playlist.id', playlistId),
                                cache.setValue('player.albumId', albumId),
                                cache.setValue('player.playlist.albumId', albumId),
                                cache.setValue('player.playlist.albumName', album),
                                cache.setValue('player.popularity', popularity),
                                cache.setValue('player.playlist.owner', ownerId),
                                cache.setValue('player.playlist.tracksTotal', parseInt(trackCount, 10)),
                                cache.setValue('player.playlist.imageUrl', playlistImage),
                                cache.setValue('player.playlist.name', playlistName),
                                cache.setValue('player.playlist.snapshot_id', snapshot_id),
                                cache.setValue('player.playlist', null, {
                                    type: 'channel',
                                    common: {
                                        name: (isEmpty(playlistName) ? 'Commands to control playback related to the playlist' : playlistName),
                                        type: 'string'
                                    },
                                    native: {}
                                })
                            ])
                            .then(() => {
                                // neu anpassen Abfrage der playlists abhängig von snapshot_id !!!
                                let trackListIdLen = loadOrDefault(cache.getValue(`playlists.${clearPrefix}.trackListIds`), 'val', '').length;
                                let trackListIdPlayerLen = loadOrDefault(cache.getValue('player.playlist.trackListIds'), 'val', '').length;
                                if (!isEmpty(trackListIdLen) && !isEmpty(trackListIdPlayerLen) && trackListIdLen !== trackListIdPlayerLen) {
                                    return createPlaylists({
                                        items: [
                                            playlistInfoCache[clearPrefix]
                                        ]
                                    });
                                } else {
                                    //return refreshPlaylistList();
                                }
                            })
                            .then(() => {
                                //Listen nach player.playlist kopieren
                                const promises = [
                                    copyState(`playlists.${clearPrefix}.trackListNumber`, 'player.playlist.trackListNumber'),
                                    copyState(`playlists.${clearPrefix}.trackListString`, 'player.playlist.trackListString'),
                                    copyState(`playlists.${clearPrefix}.trackListStates`, 'player.playlist.trackListStates'),
                                    copyObjectStates(`playlists.${clearPrefix}.trackList`, 'player.playlist.trackList'),
                                    copyState(`playlists.${clearPrefix}.trackListIdMap`, 'player.playlist.trackListIdMap'),
                                    copyState(`playlists.${clearPrefix}.trackListIds`, 'player.playlist.trackListIds'),
                                    copyState(`playlists.${clearPrefix}.trackListArray`, 'player.playlist.trackListArray')
                                ];
                                if (trackList && trackList.val) {
                                    //adapter.log.debug('TrackList.val: ' + parseInt(trackList.val, 10));
                                    promises.push(cache.setValue('player.playlist.trackNo', (parseInt(trackList.val, 10) + 1)));
                                }
                                return Promise.all(promises);
                            })
                            .then(() => {
                                //setzen der TrackNo
                                let idLstst = cache.getValue(`playlists.${clearPrefix}.trackListIds`);
                                let stateNumbers = cache.getValue(`playlists.${clearPrefix}.trackListNumber`);
                                let stateSongId = cache.getValue('player.trackId');
                                let ids = loadOrDefault(idLstst, 'val', '');
                                let num = loadOrDefault(stateNumbers, 'val', '');
                                let songId = loadOrDefault(stateSongId, 'val', '');
                                if (isEmpty(trackId) && !isEmpty(songId)) {
                                    trackId = songId;
                                }
                                if (!isEmpty(ids) && !isEmpty(num) && !isEmpty(trackId)) {
                                    let stateName = ids.split(';');
                                    let stateNr = num.split(';');
                                    let nr = stateName.indexOf(trackId);
                                    if (nr >= 0) {
                                        let no = parseInt(stateNr[nr], 10);
                                        //adapter.log.debug('TrackNo: ' + (no + 1));
                                        return Promise.all([
                                            cache.setValue('player.playlist.trackNo', (no + 1)),
                                            cache.setValue(`playlists.${clearPrefix}.trackList`, no),
                                            cache.setValue('player.playlist.trackList', no)
                                        ]);
                                    }
                                } else {
                                    adapter.log.warn('getPlaybackInfo(playlist) ids or num or trackid is empty');
                                }
                            });
                        } else {
                            // uri isEmpty | isPlaying false
                            //playlist daten löschen ??
                            //adapter.log.warn(`löschen player.playlist daten context type: "${type}"`);  
                        }
    
                    } else if (type === 'album') {
                        //Album-Daten einfügen
                        let AlbumName = loadOrDefault(data, 'item.album.name', '');
                        if (isEmpty(AlbumName)) {
                            AlbumName = album;
                        }
                        contextDescription = 'Album: ' + AlbumName;
                        let albumImage = loadOrDefault(data, 'item.album.images[0].url', '');
                        let imageUrl64 = loadOrDefault(data, 'item.album.images[2].url', '');
                        let imageUrl300 = loadOrDefault(data, 'item.album.images[1].url', '');
                        contextImage = albumImage;
                        let trackCount = loadOrDefault(data, 'item.album.total_tracks', 0);
                        let release_date = loadOrDefault(data,'item.album.release_date', '');
                        if (isEmpty(albumArtistName) && !isEmpty(artist)) {
                            albumArtistName = artist;
                        }
                        albumCache[albumId] = {
                            album: {
                                id: albumId,
                                artists: [{name: albumArtistName}],
                                name: AlbumName,
                                total_tracks: trackCount,
                                release_date: release_date,
                                images: [{url: albumImage}, {url: imageUrl300}, {url: imageUrl64}]
                            },
                            total: trackCount
                        };
                        const trackList = cache.getValue(`albums.${albumId}.trackList`);
                        return Promise.all([
                            cache.setValue('player.albumId', albumId),
                            cache.setValue('player.popularity', popularity),
                            cache.setValue('player.album.id', albumId),
                            cache.setValue('player.album.release_date', release_date),
                            cache.setValue('player.album.popularity', popularity),
                            cache.setValue('player.album.tracksTotal', parseInt(trackCount, 10)),
                            cache.setValue('player.album.imageUrl', albumImage),
                            cache.setValue('player.album.imageUrl64', imageUrl64),
                            cache.setValue('player.album.name', AlbumName),
                            cache.setValue('player.album.artistName', albumArtistName),
                            cache.setValue('player.album', null, {
                                type: 'channel',
                                common: {
                                    name: (isEmpty(AlbumName) ? 'Commands to control playback related to the album' : AlbumName),
                                    type: 'string'
                                },
                                native: {}
                            })
                        ])
                            .then(() => {
                                let trackListIdLen = loadOrDefault(cache.getValue(`albums.${albumId}.trackListIds`), 'val', '').length;
                                let trackListIdPlayerLen = loadOrDefault(cache.getValue('player.album.trackListIds'), 'val', '').length;
                                if (!isEmpty(trackListIdLen) && !isEmpty(trackListIdPlayerLen) && trackListIdLen !== trackListIdPlayerLen) {
                                    return createAlbums({
                                        items: [
                                            albumCache[albumId]
                                        ]
                                    });
                                } else {
                                    return refreshAlbumList();
                                }
                            })
                            .then(() => {
                                const promises = [
                                    copyState(`albums.${albumId}.trackListNumber`, 'player.album.trackListNumber'),
                                    copyState(`albums.${albumId}.trackListString`, 'player.album.trackListString'),
                                    copyState(`albums.${albumId}.trackListStates`, 'player.album.trackListStates'),
                                    copyObjectStates(`albums.${albumId}.trackList`, 'player.album.trackList'),
                                    copyState(`albums.${albumId}.trackListIdMap`, 'player.album.trackListIdMap'),
                                    copyState(`albums.${albumId}.trackListIds`, 'player.album.trackListIds'),
                                    copyState(`albums.${albumId}.trackListArray`, 'player.album.trackListArray')
                                ];
                                if (trackList) {
                                    promises.push(cache.setValue('player.album.trackNo', (parseInt(trackList.val, 10) + 1)));
                                }
                                return Promise.all(promises);
                            })
                            .then(() => {
                                //setzen der TrackNo
                                let state = cache.getValue(`albums.${albumId}.trackListIds`);
                                let stateNumbers = cache.getValue(`albums.${albumId}.trackListNumber`);
                                let stateSongId = cache.getValue('player.trackId');
                                let ids = loadOrDefault(state, 'val', '');
                                let num = loadOrDefault(stateNumbers, 'val', '');
                                let songId = loadOrDefault(stateSongId, 'val', '');
                                if (isEmpty(trackId) && !isEmpty(songId)) {
                                    trackId = songId;
                                }
                                if (!isEmpty(ids) && !isEmpty(num) && !isEmpty(trackId)) {
                                    let stateName = ids.split(';');
                                    let stateNr = num.split(';');
                                    let nr = stateName.indexOf(trackId);
                                    if (nr >= 0) {
                                        let no = parseInt(stateNr[nr], 10);
                                        //adapter.log.warn('TrackNo: ' + (no + 1));
                                        return Promise.all([
                                            cache.setValue(`albums.${albumId}.trackList`, no),
                                            cache.setValue('player.album.trackList', no),
                                            cache.setValue('player.album.trackNo', (no + 1))
                                        ]);
                                    }
                                }
                            })
                            .catch(err => adapter.log.warn('createPlaybackInfo album error: ' + err));
                        /*.then(() => {
                            return Promise.all([
                                listenOnHtmlPlaylists(),
                                listenOnHtmlTracklist()
                            ])
                        });*/
                    } else if (type === 'collection') {
                        //Album-Daten einfügen
                        let AlbumName = loadOrDefault(data, 'item.album.name', '');
                        contextDescription = 'Collection-Album: ' + AlbumName;
                        let albumImage = loadOrDefault(data, 'item.album.images[0].url', '');
                        contextImage = albumImage;
                        //<--anpassen gibt es nicht aus collections holen
                        let collectionName = 'favorite Collection';
                        let collectionId = 'myFavoriteCollection';
                        let trackCount = loadOrDefault(cache.getValue(`collections.${collectionId}.tracksTotal`), 'val', 0); 
                        const trackList = cache.getValue(`collections.${collectionId}.trackList`);
                        return Promise.all([
                            cache.setValue('player.albumId', albumId),
                            cache.setValue('player.popularity', popularity),
                            cache.setValue('player.collection.id', albumId),
                            cache.setValue('player.collection.tracksTotal', parseInt(trackCount, 10)),
                            cache.setValue('player.collection.imageUrl', albumImage),
                            cache.setValue('player.collection.name', AlbumName),
                            cache.setValue('player.collection.artistName', albumArtistName),
                            cache.setValue('player.collection', null, {
                                type: 'channel',
                                common: {
                                    name: (isEmpty(collectionName) ? 'Commands to control playback related to the collection' : collectionName),
                                    type: 'string'
                                },
                                native: {}
                            })
                        ])
                            .then(() => {
                                let trackListIdLen = loadOrDefault(cache.getValue(`collections.${collectionId}.trackListIds`), 'val', '').length;
                                let trackListIdPlayerLen = loadOrDefault(cache.getValue('player.collection.trackListIds'), 'val', '').length;
                                if (!isEmpty(trackListIdLen) && !isEmpty(trackListIdPlayerLen) && trackListIdLen !== trackListIdPlayerLen) {
                                    return createCollections();
                                } else {
                                    //return refreshCollectionList(); //<<-- anpassen prüfen - nur 1x liste noch kein bedarf
                                    return;
                                }
                            })
                            .then(() => {
                                const promises = [
                                    copyState(`collections.${collectionId}.tracksTotal`, 'player.collection.tracksTotal'),
                                    copyState(`collections.${collectionId}.trackListNumber`, 'player.collection.trackListNumber'),
                                    copyState(`collections.${collectionId}.trackListString`, 'player.collection.trackListString'),
                                    copyState(`collections.${collectionId}.trackListStates`, 'player.collection.trackListStates'),
                                    copyObjectStates(`collections.${collectionId}.trackList`, 'player.collection.trackList'),
                                    copyState(`collections.${collectionId}.trackListIdMap`, 'player.collection.trackListIdMap'),
                                    copyState(`collections.${collectionId}.trackListIds`, 'player.collection.trackListIds'),
                                    copyState(`collections.${collectionId}.trackListArray`, 'player.collection.trackListArray')
                                ];
                                if (trackList) {
                                    promises.push(cache.setValue('player.collection.trackNo', (parseInt(trackList.val, 10) + 1)));
                                }
                                return Promise.all(promises);
                            })
                            .then(() => {
                                //setzen der TrackNo
                                let state = cache.getValue(`collections.${collectionId}.trackListIds`);
                                let stateNumbers = cache.getValue(`collections.${collectionId}.trackListNumber`);
                                let stateSongId = cache.getValue('player.trackId');
                                let ids = loadOrDefault(state, 'val', '');
                                let num = loadOrDefault(stateNumbers, 'val', '');
                                let songId = loadOrDefault(stateSongId, 'val', '');
                                if (isEmpty(trackId) && !isEmpty(songId)) {
                                    trackId = songId;
                                }
                                if (!isEmpty(ids) && !isEmpty(num) && !isEmpty(trackId)) {
                                    let stateName = ids.split(';');
                                    let stateNr = num.split(';');
                                    let nr = stateName.indexOf(trackId);
                                    if (nr >= 0) {
                                        let no = parseInt(stateNr[nr], 10);
                                        //adapter.log.warn('TrackNo: ' + (no + 1));
                                        return Promise.all([
                                            cache.setValue(`collections.${collectionId}.trackList`, no),
                                            cache.setValue('player.collection.trackList', no),
                                            cache.setValue('player.collection.trackNo', (no + 1))
                                        ]);
                                    }
                                }
                            });
                    }
                })
                .catch(err => adapter.log.warn('createPlaybackInfo error: ' + err));
            } else if (type === 'episode' || type === 'show'){
                //adapter.log.warn('episodeId: ' + episodeId + ' und lastEpisodeId: ' + lastPlayingShow.lastEpisodeId);
                if (isEmpty(episodeId) || lastPlayingShow.lastEpisodeId != episodeId) {
                    // code für currently playing types einfügen (nur 1x ausführen - 10s!)    
                    //adapter.log.warn('vor getCurrentlyPlaying');
                    return getCurrentlyPlayingType('episode')
                    .then((retObj) => {
                        //adapter.log.warn('retObj: ' + JSON.stringify(retObj));
                        if (!isEmpty(retObj)) {
                            //adapter.log.warn('retObj nicht leer nach getCurrentlyPlaying');
                            episodeId = retObj.episodeId;
                            duration = retObj.durationMs;
                            showId = retObj.showId;
                            lastPlayingShow.lastShowId = showId;
                            lastPlayingShow.lastEpisodeId = episodeId;
                            lastPlayingShow.lastEpisodeDuration_ms = duration;
                            let epiIdLst = loadOrDefault(cache.getValue('shows.' + showId + '.episodeListIds'),'val', '').split(';');
                            if (epiIdLst && epiIdLst.length > 0) {
                                let epi_ix = epiIdLst.indexOf(episodeId);
                                if (epi_ix >= 0) {
                                    lastPlayingShow.lastEpisodeNo = epi_ix;
                                    episodeNo = epi_ix;
                                }
                            }
                            if (duration > 0) {
                                progressPercentage = Math.floor(progress / duration * 100);
                            }
                            //adapter.log.warn('epitype: ' + type);
                            if (!isEmpty(showId)){
                                let publisherState = cache.getValue('shows.' + showId + '.publisher');
                                let publisher = loadOrDefault(publisherState, 'val', '');
                                let showStateName = cache.getValue('shows.' + showId + '.name');
                                let showImageUrlState = cache.getValue('shows.' + showId + '.imageUrl');
                                let imageUrl300State = cache.getValue('shows.' + showId + '.imageUrl300');
                                let imageUrl64State = cache.getValue('shows.' + showId + '.imageUrl64'); 
                                let total_epiState = cache.getValue('shows.' + showId + '.episodesTotal');
                                let showName = loadOrDefault(showStateName, 'val', '');
                                let imageUrl = loadOrDefault(showImageUrlState, 'val', '');
                                let imageUrl64 = loadOrDefault(imageUrl64State, 'val', '');
                                let imageUrl300 = loadOrDefault(imageUrl300State, 'val', '');
                                let total_episodes = loadOrDefault(total_epiState, 'val', 0);
                                let epiLstState = cache.getValue('shows.' + showId + '.episodeListString');
                                let epiLst = loadOrDefault(epiLstState, 'val', '').split(';');
                                contextDescription = 'Show: ' + showName;
                                //einfügen code für episodeNo ermitteln, wenn das mal möglich wird
                                let epiName = '';
                                let eno = 0;
                                if (epiLst && epiLst.length > 0) {
                                    eno = episodeNo;
                                    epiName = epiLst[eno];
                                }
                                const promises = [
                                    copyState(`shows.${showId}.episodeListNumber`, 'player.show.episodeListNumber'),
                                    copyState(`shows.${showId}.episodeListString`, 'player.show.episodeListString'),
                                    copyState(`shows.${showId}.episodeListStates`, 'player.show.episodeListStates'),
                                    copyObjectStates(`shows.${showId}.episodeList`, 'player.show.episodeList'),
                                    copyState(`shows.${showId}.episodeListIdMap`, 'player.show.episodeListIdMap'),
                                    copyState(`shows.${showId}.episodeListIds`, 'player.show.episodeListIds'),
                                    copyState(`shows.${showId}.episodeListArray`, 'player.show.episodeListArray'),
                                ];
                                return Promise.all(promises)
                                .then(() => {
                                    //adapter.log.warn('write player data');
                                    return Promise.all([
                                        cache.setValue('player.isPlaying', isPlaying),
                                        cache.setValue(`shows.${showId}.episodeList`, eno),
                                        cache.setValue('player.show.episodeList', eno),
                                        cache.setValue('player.episodeId', episodeId),
                                        cache.setValue('player.episodeName',epiName),
                                        cache.setValue('player.show.name', showName),
                                        cache.setValue('player.show.id', showId),
                                        cache.setValue('player.show.imageUrl', imageUrl),
                                        cache.setValue('player.show.imageUrl64', imageUrl64),
                                        cache.setValue('player.show.episodesTotal', total_episodes),
                                        cache.setValue('player.show.publisher', publisher),
                                        cache.setValue('player.show.episodeNo', eno),
                                        cache.setValue('player.durationMs', duration),
                                        cache.setValue('player.duration', convertToDigiClock(duration)),
                                        cache.setValue('player.type', type),
                                        cache.setValue('player.progressMs', progress),
                                        cache.setValue('player.progressPercentage', progressPercentage),
                                        cache.setValue('player.progress', convertToDigiClock(progress)),
                                        cache.setValue('player.shuffle', (shuffle ? 'on' : 'off')),
                                        cache.setValue('player.repeat', repeat),
                                        //setOrDefault(data, 'repeat_state', 'player.repeat', adapter.config.defaultRepeat),
                                        setOrDefault(data, 'device.volume_percent', 'player.device.volume', 100)
                                    ])
                                })  
                            }
                        }
                    })
                    .catch(err => adapter.log.warn('createPlaybackInfo warning ' + err));
                }
            }
        })           
        .then(() => Promise.all([
            cache.setValue('player.contextImageUrl', contextImage),
            cache.setValue('player.contextDescription', contextDescription)
        ]))
        .then(() => {
            if (progress && isPlaying && application.statusPlayPollingDelaySeconds > 0) {
                scheduleStatusInternalTimer(duration, progress, Date.now(), application.statusPlayPollingDelaySeconds - 1);
            }
        })
        .catch(err => adapter.log.warn('createPlaybackInfo error: ' + err));
    } else {
        clearTimeout(application.statusInternalTimer);
        cache.setValue('player.isPlaying', isPlaying);
        cache.setValue('player.type', type);
        if (application.statusPollingDelaySeconds > 0){
            scheduleStatusPolling();
        }
    }
}

function convertToDigiClock(ms) {
    // milliseconds to digital time, e.g. 3:59=238759
    if (!ms) {
        ms = 0;
    }
    let min = Math.floor(ms / 60000);
    let sec = Math.floor(((ms % 360000) % 60000) / 1000);
    if (min < 10) {
        min = '0' + min;
    }
    if (sec < 10) {
        sec = '0' + sec;
    }
    return min + ':' + sec;
}

function setUserInformation(data) {
    application.userId = data.id;
    return cache.setValue('authorization.userId', data.id);
}

/*einzelne Playlist+Tracklist aktualisieren wenn isPlaying true*/ 
function getCurrentPlaylist() {
    let userId = application.userId;
    let playlistStateId = loadOrDefault(cache.getValue('player.playlist.id'), 'val', '');
    let playlistOwner = loadOrDefault(cache.getValue('player.playlist.owner'), 'val', '');
    let prefix = shrinkStateName(playlistOwner + '-' + playlistStateId);
    doNotTestSnapshotId = true;
    if (isPlaying && !isEmpty(userId) && !isEmpty(playlistStateId)) {
        return sendRequest(`/v1/users/${userId}/playlists/${playlistStateId}`, 'GET', '')
            .then(data => createPlaylists({ items: [data]}))
            .then(() => {
                    copyState('playlists.' + prefix + '.trackListArray', 'player.playlist.trackListArray');
                    copyState('playlists.' + prefix + '.snapshot_id', 'player.playlist.snapshot_id');
                    copyState('playlists.' + prefix + '.trackListNumber', 'player.playlist.trackListNumber');
                    copyState('playlists.' + prefix + '.trackListString', 'player.playlist.trackListString');
                    copyState('playlists.' + prefix + '.trackListStates', 'player.playlist.trackListStates');
                    copyObjectStates('playlists.' + prefix + '.trackList', 'player.playlist.trackList');
                    copyState('playlists.' + prefix + '.trackListIdMap', 'player.playlist.trackListIdMap');
                    copyState('playlists.' + prefix + '.trackListIds', 'player.playlist.trackListIds');
                    doNotTestSnapshotId = false;
                    cache.setValue('getCurrentPlaylist', {val: false, ack: true});
            })
            .catch(err => {
                doNotTestSnapshotId = false;
                adapter.log.warn('error in getCurrentPlaylist: ' + err);
                });
    }
}

function refreshThisPlaylist(obj) {
    if (obj && obj.state && obj.state.val){
        let userId = application.userId;
        doNotTestSnapshotId = true;
        let owner = loadOrDefault(cache.getValue('playlists.' + obj.state.val + '.owner'), 'val', '');
        let playlistId = loadOrDefault(cache.getValue('playlists.' + obj.state.val + '.id', 'val', ''));
        let prefix = shrinkStateName(owner + '-' + playlistId);
        if (!isEmpty(userId) && !isEmpty(playlistId)) {
            return sendRequest(`/v1/users/${userId}/playlists/${playlistId}`, 'GET', '')
                .then(data => createPlaylists({ items: [data]}))
                .then(() => {
                        copyState('playlists.' + prefix + '.trackListArray', 'player.playlist.trackListArray');
                        copyState('playlists.' + prefix + '.snapshot_id', 'player.playlist.snapshot_id');
                        copyState('playlists.' + prefix + '.trackListNumber', 'player.playlist.trackListNumber');
                        copyState('playlists.' + prefix + '.trackListString', 'player.playlist.trackListString');
                        copyState('playlists.' + prefix + '.trackListStates', 'player.playlist.trackListStates');
                        copyObjectStates('playlists.' + prefix + '.trackList', 'player.playlist.trackList');
                        copyState('playlists.' + prefix + '.trackListIdMap', 'player.playlist.trackListIdMap');
                        copyState('playlists.' + prefix + '.trackListIds', 'player.playlist.trackListIds');
                        doNotTestSnapshotId = false;
                })
                .catch(err => {
                    doNotTestSnapshotId = false;
                    adapter.log.warn('error in refreshThisPlaylist: ' + err);
                });
        }
    } else {
        adapter.log.warn('error in refreshThisPlaylist - no object');
    }
}

function reloadUsersPlaylistNoTest() {
    playlistComplete = false;
    doNotTestSnapshotId = true;
    return getUsersPlaylist(0)
    .then(addedList => {
        if (application.deletePlaylists && addedList && playlistComplete) {
            return deleteUsersPlaylist(addedList);
        }
    })
    .then(() => {
        //refreshPlaylistList();
        btnRefreshPlaylistList();
        if (playlistComplete) {
            cache.setValue('getPlaylists', {val: false, ack: true});
        }
        loadPlaylistAppCache();
        plAppCacheReload = false;
        doNotTestSnapshotId = false;        
    });
}

/*default run all 15 min from pollPlaylistApi()*/
function reloadUsersPlaylist() {
    playlistComplete = false;
    return getUsersPlaylist(0)
        .then(addedList => {
            if (application.deletePlaylists && addedList && playlistComplete) {
                return deleteUsersPlaylist(addedList);
            }
        })
        .then(() => {
            refreshPlaylistList();
            //btnRefreshPlaylistList();
            cache.setValue('lastLoadPlaylist', Date.now());
            if (playlistComplete) {
                cache.setValue('getPlaylists', {val: false, ack: true});
            }
            loadPlaylistAppCache();
            plAppCacheReload = false;
            
        });
}

function reloadUsersShows() {
    showComplete = false;
    return getUsersShows(0)
        .then(addedList => {
            if (application.deletePlaylists && addedList && showComplete) {
                return deleteUsersShows(addedList);
            }
        })
        .then(() => {
            refreshShowsList();
            //btnRefreshShowList();
            cache.setValue('lastLoadShow', Date.now());
            if (showComplete) {
                cache.setValue('getShows', {val: false, ack: true});
            }
        });
}

function reloadUsersAlbums() {
    albumComplete = false;
    return getUsersAlbum(0)
        .then(addedList => {
            if (application.deletePlaylists && addedList && albumComplete) {
                return deleteUsersAlbums(addedList);
            }
        })
        .then(() => {
            doNotTestAlbum = false;
            refreshAlbumList();
            //btnRefreshAlbumList();
            cache.setValue('lastLoadAlbum', Date.now());
            if (albumComplete) {
                cache.setValue('getAlbums', {val: false, ack: true});
            }
        });
}

function reloadUsersAlbumBtn() {
    doNotTestAlbum = true;
    reloadUsersAlbums();
}

function deleteUsersShows(addedList) {
    let states = cache.getValue('shows.*');
    let keys = Object.keys(states);
    let fn = function (key) {
        key = removeNameSpace(key);
        let found = false;
        if (addedList) {
            for (let i = 0; i < addedList.length; i++) {
                if (key.startsWith(addedList[i])) {
                    found = true;
                    break;
                }
            }
        }

        if (!found &&
            key !== 'shows.showList' &&
            key !== 'shows.showListIds' &&
            key !== 'shows.showListString'
        ) {
            return cache.delObject(key)
                .then(() => {
                    if (key.endsWith('.id')) {
                        return cache.delObject(key.substring(0, key.length - 3));
                    }
                });
        }
    };
    return Promise.all(keys.map(fn));
}

function deleteUsersAlbums(addedList) {
    let states = cache.getValue('albums.*');
    let keys = Object.keys(states);
    let fn = function (key) {
        key = removeNameSpace(key);
        let found = false;
        if (addedList) {
            for (let i = 0; i < addedList.length; i++) {
                if (key.startsWith(addedList[i])) {
                    found = true;
                    break;
                }
            }
        }

        if (!found &&
            key !== 'albums.albumList' &&
            key !== 'albums.albumListIds' &&
            key !== 'albums.albumListString' &&
            key !== 'albums.artistAlbumList' &&
            key !== 'albums.artistList'
        ) {
            return cache.delObject(key)
                .then(() => {
                    if (key.endsWith('.id')) {
                        return cache.delObject(key.substring(0, key.length - 3));
                    }
                });
        }
    };
    return Promise.all(keys.map(fn));
}

function deleteUsersPlaylist(addedList) {
    let states = cache.getValue('playlists.*');
    let keys = Object.keys(states);
    let fn = function (key) {
        key = removeNameSpace(key);
        let found = false;
        if (addedList) {
            for (let i = 0; i < addedList.length; i++) {
                if (key.startsWith(addedList[i])) {
                    found = true;
                    break;
                }
            }
        }

        if (!found &&
            key !== 'playlists.playlistList' &&
            key !== 'playlists.playlistListIds' &&
            key !== 'playlists.playlistListString' &&
            key !== 'playlists.yourPlaylistListIds' &&
            key !== 'playlists.yourPlaylistListString'
        ) {
            return cache.delObject(key)
                .then(() => {
                    if (key.endsWith('.id')) {
                        return cache.delObject(key.substring(0, key.length - 3));
                    }
                });
        }
    };
    return Promise.all(keys.map(fn));
}

function createShows(parseJson, autoContinue, addedList) {
    if (isEmpty(parseJson) || isEmpty(parseJson.items)) {
        adapter.log.debug('no show content');
        return Promise.reject('no show content');
    }
    try {
        //adapter.log.warn('createShows.items: '+ parseJson.items.length);
        let fn = function (item) {
            let showName = loadOrDefault(item.show, 'name', '');
            if (isEmpty(showName)) {
                adapter.log.warn('empty show name');
                return Promise.reject('empty show name');
            }
            let description = loadOrDefault(item.show, 'description', '');
            let showId = loadOrDefault(item.show, 'id', '');
            if (isEmpty(showId)) {
                return Promise.reject('createShows(...) empty showId');
            }
            adapter.log.debug('showId: ' + showId + ' showName: ' + showName);
            let publisher = loadOrDefault(item.show, 'publisher', '');
            let total_episodes = loadOrDefault(item.show, 'total_episodes', '');
            let imageUrl = loadOrDefault(item.show, 'images[0].url', '');
            let type = loadOrDefault(item.show, 'type', '');
            let uri = loadOrDefault(item.show, 'uri', '');
            let prefix = 'shows.' + shrinkStateName(showId);
            addedList = addedList || [];
            addedList.push(prefix);

            return Promise.all([
                cache.setValue(prefix, null, {
                    type: 'channel',
                    common: {name: showName},
                    native: {}
                }),
                cache.setValue(prefix + '.playThisShow', false, {
                    type: 'state',
                    common: {
                        name: 'press to play this show',
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                        icon: 'icons/play_black.png'
                    },
                    native: {}
                }),
                createOrDefault(item.show, 'id', prefix + '.id', '', 'show id', 'string'),
                createOrDefault(item.show, 'name', prefix + '.name', '', 'show name', 'string'),
                createOrDefault(item.show, 'publisher', prefix + '.publisher', '', 'show publisher', 'string'),
                createOrDefault(item.show, 'description', prefix + '.description', '', 'show description', 'string'),
                createOrDefault(item.show, 'uri', prefix + '.uri', '', 'show uri', 'string'),
                createOrDefault(item.show, 'total_episodes', prefix + '.episodesTotal', 0, 'number of episodes', 'number'),
                createOrDefault(item.show, 'images[0].url', prefix + '.imageUrl', '', 'image url', 'string'),
                createOrDefault(item.show, 'images[1].url', prefix + '.imageUrl300', '', 'image url 300px', 'string'),
                createOrDefault(item.show, 'images[2].url', prefix + '.imageUrl64', '', 'image url 64px', 'string')
            ])
            .then(() => getShowEpisodes(showId))
            .then(showObject => {
                if (showObject.episodes.length > 0) {
                
                    let episodesListValue = '';
                    let statecurrSID = cache.getValue('player.show.id');
                    let currentShowId = loadOrDefault(statecurrSID, 'val', '');
                    let stateEpisodeId = cache.getValue('player.episodeId');
                    let episodesId = loadOrDefault(stateEpisodeId, 'val', '');
                    let prefix = 'shows.' + `${showId}`;
                    if (`${showId}` === `${currentShowId}`) {
                        let stateName = showObject.episodeIds.split(';');
                        let stateArr = [];
                        for (let i = 0; i < stateName.length; i++) {
                            let ele = stateName[i].split(':');
                            stateArr[ele[1]] = ele[0];
                        }
                        if (stateArr[episodesId] !== '' && (stateArr[episodesId] !== null)) {
                            episodesListValue = stateArr[episodesId];
                        }
                    }
                    const stateObj = {};                    
                    const states = loadOrDefault(showObject, 'stateString', '').split(';');
                    states.forEach(state => {
                        let el = state.split(':');
                        if (el && el.length === 2) {
                            stateObj[el[0]] = el[1];
                        }
                    });
                    
                    return Promise.all([
                        cache.setValue(prefix + '.episodeList', episodesListValue, {
                            type: 'state',
                            common: {
                                name: 'Episodes of the show saved in common part. Change this value to a episode position number to start this show with this episode. First episode is 0',
                                type: 'mixed',
                                role: 'value',
                                states: stateObj,
                                read: true,
                                write: true
                            },
                            native: {}
                        }),

                        createOrDefault(showObject, 'listNumber', prefix + '.episodeListNumber', '',
                            'contains list of episodes as string, patter: 0;1;2;...',
                            'string'),
                        createOrDefault(showObject, 'listString', prefix + '.episodeListString', '',
                            'contains list of episodes as string, patter: episode;episode;episode;...',
                            'string'),
                        createOrDefault(showObject, 'stateString', prefix + '.episodeListStates', '',
                            'contains list of episode as string with position, pattern: 0:episode;1:episode;2:episode;...',
                            'string'),
                        createOrDefault(showObject, 'episodeIdMap', prefix + '.episodeListIdMap', '',
                            'contains list of episode ids as string with position, pattern: 0:id;1:id;2:id;...',
                            'string'),
                        createOrDefault(showObject, 'episodeDuration_msList', prefix + '.episodeDuration_msList', '',
                            'contains list of episode duration_ms as string, pattern: duration_ms;duration_ms;duration_ms...',
                            'string'),
                        createOrDefault(showObject, 'episodeIds', prefix + '.episodeListIds', '',
                            'contains list of episode ids as string, pattern: id;id;id;...',
                            'string'),
                        createOrDefault(showObject, 'episodeImageUrl64', prefix + '.episodeImageUrl64List', '',
                            'contains list of episode imageUrl64 as string, pattern: url;url;url;...',
                            'string'),
                        createOrDefault(showObject, 'episodes', prefix + '.episodeListArray', '',
                            'contains list of episodes as array object...[id: id, episodeName: text, publisher: Der Spiegel, description: description, duration: xx, explicit: explicit, is_playable: true', 'object')
                    ]);      
                }
            });
        };
        let p = Promise.resolve();
        for (let i = 0; i < parseJson.items.length; i++) {
            p = p
                .then(() => new Promise(resolve => setTimeout(() => !stopped && resolve(), 1000)))
                .then(() => fn(parseJson.items[i]));
        }

        return p.then(() => {
            if (autoContinue && parseJson.items.length !== 0 && (parseJson['next'] !== null)) {
                showComplete = false;
                return getUsersShows(parseJson.offset + parseJson.limit, addedList);
            } else {
                showComplete = true;
                return addedList;
            }
        });
    } catch(err) {
        showComplete = false;
        adapter.log.warn('error on createShows: ' + err);
    }
}

function findPlaylistSnapshotId(owner, playlistId, snapIdToFind) {
    if (!isEmpty(owner) && !isEmpty(playlistId) && !isEmpty(snapIdToFind) && playlistAppCache.length > 0) {
        //suche snapshotId für playlistId
        let x = -1;
        let prefix = shrinkStateName(owner + '-' + playlistId);
        let snapId = '';
        for (let i = 0; i < playlistAppCache.length; i++) {
            if (playlistAppCache[i].appId === prefix) {
                x = i;
                break;
            }
        }
        if ( x >= 0) {
            snapId = playlistAppCache[x].snapshot_id;
            //decodierte snapshotId prüfen
            let buff = new Buffer.from(snapId, 'base64');
            let buffToFind = new Buffer.from(snapIdToFind, 'base64');
            let _snapIdStr = buff.toString('ascii').split(',');
            let _snapIdTs = _snapIdStr[0];
            let _snapId = _snapIdStr[1];
            let _snapToFindStr = buffToFind.toString('ascii').split(',');
            let _snapToFindTs = _snapToFindStr[0];
            let _snapIdToFind = _snapToFindStr[1];
            if ((snapId.length > 15) && (snapIdToFind.length > 15)) {
                //timestamp prüfen
                if (_snapIdTs === _snapToFindTs) {
                    if (_snapId === _snapIdToFind) {
                        pl_foundCount++;
                        return true;
                    } else {
                        pl_notFoundCount++;
                        return false;
                    }
                } else{
                    pl_notFoundCount++;
                    return false;
                }
            } else {
                pl_notFoundCount++;
                return false;
            }
        } else {
            pl_notFoundCount++;
            return false;
        }
    } else {
        pl_notFoundCount++;
        return false;
    }
}

function createPlaylists(parseJson, autoContinue, addedList) {
    if (isEmpty(parseJson) || isEmpty(parseJson.items)) {
        adapter.log.debug('no playlist content');
        return Promise.reject('no playlist content');
    }
    let fn = function (item) {
        let playlistName = loadOrDefault(item, 'name', '');
        if (!isEmpty(playlistName)) {
            //adapter.log.warn('empty playlist name');
            //return Promise.reject('empty playlist name');
        
            let playlistId = loadOrDefault(item, 'id', '');
            let ownerId = loadOrDefault(item, 'owner.id', '');
            let trackCount = loadOrDefault(item, 'tracks.total', '');
            let snapshot_id = loadOrDefault(item, 'snapshot_id', '');
            let imageUrl = loadOrDefault(item, 'images[0].url', '');
            let clearPrefix = shrinkStateName(ownerId + '-' + playlistId);
            playlistInfoCache[clearPrefix] = {
                id: playlistId,
                name: playlistName,
                snapshot_id: snapshot_id,
                images: [{url: imageUrl}],
                owner: {id: ownerId},
                tracks: {total: trackCount}
            };

            let prefix = 'playlists.' + shrinkStateName(ownerId + '-' + playlistId);
            addedList = addedList || [];
            addedList.push(prefix);
            //let findPlSnap = findPlaylistSnapshotId(ownerId, playlistId, snapshot_id);
            //snapshot selection
            if (doNotTestSnapshotId || !findPlaylistSnapshotId(ownerId, playlistId, snapshot_id)) {
                //nur ausführen wenn snapshotId aus playlistAppCache != snapshot_id aus Datensatz od. id nicht gefunden
                adapter.log.debug('doNotTestSnapshotId= ' + doNotTestSnapshotId + ' or current snapshot_id not found: (' + ownerId + '-' + playlistId + ') - load new playlist data from spotify');
                return Promise.all([
                    cache.setValue(prefix, null, {
                        type: 'channel',
                        common: {name: playlistName},
                        native: {}
                    }),
                    cache.setValue(prefix + '.playThisList', false, {
                        type: 'state',
                        common: {
                            name: 'press to play this playlist',
                            type: 'boolean',
                            role: 'button',
                            read: false,
                            write: true,
                            icon: 'icons/play_black.png'
                        },
                        native: {}
                    }),
                    cache.setValue(prefix + '.playThisListTrackId', '', {
                        type: 'state',
                        common: {
                            name: 'trackId to start play this playlist',
                            type: 'string',
                            role: 'value',
                            read: true,
                            write: true,
                        },
                        native: {}
                    }),
                    createOrDefault(item, 'id', prefix + '.id', '', 'playlist id', 'string'),
                    createOrDefault(item, 'owner.id', prefix + '.owner', '', 'playlist owner', 'string'),
                    createOrDefault(item, 'name', prefix + '.name', '', 'playlist name', 'string'),
                    createOrDefault(item, 'snapshot_id', prefix + '.snapshot_id', '', 'snapshot_id', 'string'),
                    createOrDefault(item, 'tracks.total', prefix + '.tracksTotal', 0, 'number of songs', 'number'),
                    createOrDefault(item, 'images[0].url', prefix + '.imageUrl', '', 'image url', 'string')
                ])
                    .then(() => getPlaylistTracks(ownerId, playlistId, playlistName))
                    .then(playlistObject => {
                        if (playlistObject.songs.length > 0) {
                            let trackListValue = '';
                            let currentPlaylistId = cache.getValue('player.playlist.id').val;
                            let currentPlaylistOwnerId = cache.getValue('player.playlist.owner').val;
                            let songId = cache.getValue('player.trackId').val;

                            if (`${ownerId}-${playlistId}` === `${currentPlaylistOwnerId}-${currentPlaylistId}`) {
                                let stateName = playlistObject.trackIds.split(';');
                                let stateArr = [];
                                for (let i = 0; i < stateName.length; i++) {
                                    let ele = stateName[i].split(':');
                                    stateArr[ele[1]] = ele[0];
                                }
                                if (stateArr[songId] !== '' && (stateArr[songId] !== null)) {
                                    trackListValue = stateArr[songId];
                                }
                            }

                            const stateObj = {};
                            const states = loadOrDefault(playlistObject, 'stateString', '').split(';');
                            states.forEach(state => {
                                let el = state.split(':');
                                if (el && el.length === 2) {
                                    stateObj[el[0]] = el[1];
                                }
                            });
                            return Promise.all([
                                cache.setValue(prefix + '.trackList', trackListValue, {
                                    type: 'state',
                                    common: {
                                        name: 'Tracks of the playlist saved in common part. Change this value to a track position number to start this playlist with this track. First track is 0',
                                        type: 'mixed',
                                        role: 'value',
                                        states: stateObj,
                                        read: true,
                                        write: true
                                    },
                                    native: {}
                                }),

                                createOrDefault(playlistObject, 'listNumber', prefix + '.trackListNumber', '',
                                    'contains list of tracks as string, patter: 0;1;2;...',
                                    'string'),
                                createOrDefault(playlistObject, 'listString', prefix + '.trackListString', '',
                                    'contains list of tracks as string, patter: title - artist;title - artist;title - artist;...',
                                    'string'),
                                createOrDefault(playlistObject, 'stateString', prefix + '.trackListStates', '',
                                    'contains list of tracks as string with position, pattern: 0:title - artist;1:title - artist;2:title - artist;...',
                                    'string'),
                                createOrDefault(playlistObject, 'trackIdMap', prefix + '.trackListIdMap', '',
                                    'contains list of track ids as string with position, pattern: 0:id;1:id;2:id;...',
                                    'string'),
                                createOrDefault(playlistObject, 'trackIds', prefix + '.trackListIds', '',
                                    'contains list of track ids as string, pattern: id;id;id;...',
                                    'string'),
                                createOrDefault(playlistObject, 'imageUrl64Map', prefix + '.imageUrl64List', '',
                                    'contains list of track imageUrl64 as string, pattern: url;url;url;...',
                                    'string'),
                                createOrDefault(playlistObject, 'imageAlbumUrlMap', prefix + '.imageAlbumUrlList', '',
                                    'contains list of track imageAlbumUrl as string, pattern: url;url;url;...',
                                    'string'),
                                createOrDefault(playlistObject, 'songs', prefix + '.trackListArray', '',
                                    'contains list of tracks as array object, pattern:\n[{id: "id",\ntitle: "title",\nartistName: "artistName1, artistName2",\nartistArray: [{id: "artistId", name: "artistName"}, {id: "artistId", name: "artistName"}, ...],\nalbum: {id: "albumId", name: "albumName"},\ndurationMs: 253844,\nduration: 4:13,\naddedAt: 15395478261235,\naddedBy: "userId",\ndiscNumber: 1,\nepisode: false,\nexplicit: false,\npopularity: 56\n}, ...]',
                                    'object')
                            ]);
                        }
                    });
            } else {
                //adapter.log.debug('found: (' + ownerId + '-' + playlistId + ') current snapshot_id - continue next playlist');
            }
        //} else {
        //    return Promise.reject('empty playlist name');
        }
    };
    let p = Promise.resolve();
    for (let i = 0; i < parseJson.items.length; i++) {
        p = p
            .then(() => new Promise(resolve => setTimeout(() => !stopped && resolve(), 1000)))
            .then(() => fn(parseJson.items[i]));
    }

    return p.then(() => {
        if (autoContinue && parseJson.items.length !== 0 && (parseJson['next'] !== null)) {
            playlistComplete = false;
            return getUsersPlaylist(parseJson.offset + parseJson.limit, addedList);
        } else {
            adapter.log.debug('doNotTestSnapshotId: ' + doNotTestSnapshotId);
            if (!doNotTestSnapshotId) {
                adapter.log.debug('pl_notFound: ' + pl_notFoundCount + ' /pl_found: ' + pl_foundCount);
                cache.setValue('pl_notFound', pl_notFoundCount);
                cache.setValue('pl_found', pl_foundCount);
            }
            playlistComplete = true;
            return addedList;
        }
    });
}

//Album erstellen
function createAlbums(parseJson, autoContinue, addedList) {
    if (isEmpty(parseJson) || isEmpty(parseJson.items)) {
        adapter.log.debug('no album content');
        return Promise.reject('no album content');
    }
    let fn = function (item) {
        //adapter.log.warn('createAlbum parseJson: ' + JSON.stringify(parseJson));
        let oldAlbum = false;
        let albumName = loadOrDefault(item.album, 'name', '');
        if (isEmpty(albumName)) {
            adapter.log.warn('empty album name');
            return Promise.reject('empty album name');
        }
        let artistName = loadOrDefault(item.album, 'artists[0].name', '');
        albumName = (!isEmpty(artistName)) ? artistName + ' | ' + albumName : albumName;
        let albumId = loadOrDefault(item.album, 'id', '');
        let trackCount = loadOrDefault(item.album, 'tracks.total', 0);
        let release_date = loadOrDefault(item.album, 'release_date', '');
        let imageUrl = loadOrDefault(item.album, 'images[0].url', '');
        let imageUrl64 = loadOrDefault(item.album, 'images[2].url', '');
        let imageUrl300 = loadOrDefault(item.album, 'images[1].url', '');
        let popularity = loadOrDefault(item.album, 'popularity', 0);
        
        albumCache[albumId] = {
            id: albumId,
            name: albumName,
            release_date: release_date,
            images: [{url: imageUrl}, {url: imageUrl300}, {url: imageUrl64}],
            tracks: {total: trackCount}
        };

        let prefix = 'albums.' + shrinkStateName(albumId);
        addedList = addedList || [];
        addedList.push(prefix);
        let oldAlbumPath = cache.getValue(prefix + '.name');
        if (oldAlbumPath && oldAlbumPath.val) {
            let _release_date = cache.getValue(prefix + '.release_date').val;
            let _trackCount = cache.getValue(prefix + '.tracksTotal').val;
            //adapter.log.warn('Album: '+ albumName + ' gefunden, release: ' + release_date + ', tracks: ' + trackCount);
            if (release_date == _release_date && trackCount == _trackCount) {
                oldAlbum = true;
                adapter.log.debug('Album: '+ albumName + ' gefunden und release gleich');
            }
        } else {
            adapter.log.debug('Album: ' + albumName + ' nicht gefunden');
        }
        if (doNotTestAlbum || !oldAlbum){
            return Promise.all([
                cache.setValue(prefix, null, {
                    type: 'channel',
                    common: {name: albumName},
                    native: {}
                }),
                cache.setValue(prefix + '.playThisAlbum', false, {
                    type: 'state',
                    common: {
                        name: 'press to play this album',
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                        icon: 'icons/play_black.png'
                    },
                    native: {}
                }),
                createOrDefault(item.album, 'id', prefix + '.id', '', 'album id', 'string'),
                createOrDefault(item.album, 'name', prefix + '.name', '', 'album name', 'string'),
                createOrDefault(item.album, 'artists[0].name', prefix + '.artistName', '', 'artist name', 'string'),
                createOrDefault(item.album, 'release_date', prefix + '.release_date', 0, 'album release date', 'string'),
                createOrDefault(item.album, 'popularity', prefix + '.popularity', 0, 'album popularity', 'number'),
                createOrDefault(item.album, 'tracks.total', prefix + '.tracksTotal', 0, 'number of songs', 'number'),
                createOrDefault(item.album, 'images[0].url', prefix + '.imageUrl', '', 'image url', 'string'),
                createOrDefault(item.album, 'images[1].url', prefix + '.imageUrl300', '', 'image url 300px', 'string'),
                createOrDefault(item.album, 'images[2].url', prefix + '.imageUrl64', '', 'image url 64px', 'string')
            ])
                .then(() => getAlbumTracks(albumId))
                .then(albumObject => {
                    if (albumObject.songs.length > 0) {
                        let trackListValue = '';
                        let curAlbumIdState = cache.getValue('player.album.id');
                        let currentalbumId = loadOrDefault(curAlbumIdState, 'val', '');
                        let StateSongId = cache.getValue('player.trackId');
                        let songId = loadOrDefault(StateSongId, 'val', '');

                        if (`${albumId}` === `${currentalbumId}`) {
                            let stateName = albumObject.trackIds.split(';');
                            let stateArr = [];
                            for (let i = 0; i < stateName.length; i++) {
                                let ele = stateName[i].split(':');
                                stateArr[ele[1]] = ele[0];
                            }
                            if (stateArr[songId] !== '' && (stateArr[songId] !== null)) {
                                trackListValue = stateArr[songId];
                            }
                        }

                        const stateObj = {};
                        const states = loadOrDefault(albumObject, 'stateString', '').split(';');
                        states.forEach(state => {
                            let el = state.split(':');
                            if (el && el.length === 2) {
                                stateObj[el[0]] = el[1];
                            }
                        });
                        return Promise.all([
                            cache.setValue(prefix + '.trackList', trackListValue, {
                                type: 'state',
                                common: {
                                    name: 'Tracks of the album saved in common part. Change this value to a track position number to start this album with this track. First track is 0',
                                    type: 'mixed',
                                    role: 'value',
                                    states: stateObj,
                                    read: true,
                                    write: true
                                },
                                native: {}
                            }),

                            createOrDefault(albumObject, 'listNumber', prefix + '.trackListNumber', 0,
                                'contains list of tracks as string, patter: 0;1;2;...',
                                'string'),
                            createOrDefault(albumObject, 'listString', prefix + '.trackListString', '',
                                'contains list of tracks as string, patter: title - artist;title - artist;title - artist;...',
                                'string'),
                            createOrDefault(albumObject, 'stateString', prefix + '.trackListStates', '',
                                'contains list of tracks as string with position, pattern: 0:title - artist;1:title - artist;2:title - artist;...',
                                'string'),
                            createOrDefault(albumObject, 'trackIdMap', prefix + '.trackListIdMap', '',
                                'contains list of track ids as string with position, pattern: 0:id;1:id;2:id;...',
                                'string'),
                            createOrDefault(albumObject, 'trackIds', prefix + '.trackListIds', '',
                                'contains list of track ids as string, pattern: id;id;id;...',
                                'string'),
                            createOrDefault(albumObject, 'songs', prefix + '.trackListArray', '',
                                'contains list of tracks as array object, pattern:\n[{id: "id",\ntitle: "title",\nartistName: "artistName1, artistName2",\nartistArray: [{id: "artistId", name: "artistName"}, {id: "artistId", name: "artistName"}, ...],\ndurationMs: 253844,\nduration: 4:13,\ndiscNumber: 1,\nexplicit: false, ...]', 'object')
                        ]);
                    }
                });
        }
    };

    let p = Promise.resolve();
    for (let i = 0; i < parseJson.items.length; i++) {
        p = p
            .then(() => new Promise(resolve => setTimeout(() => !stopped && resolve(), 1000)))
            .then(() => fn(parseJson.items[i]));
    }

    return p.then(() => {
        if (autoContinue && parseJson.items.length !== 0 && (parseJson['next'] !== null)) {
            albumComplete = false;
            return getUsersAlbum(parseJson.offset + parseJson.limit, addedList);
        } else {
            albumComplete = true;
            return addedList;
        }
    });
}

function createCollections() {
    let trackCount = 0;
    let prefix = 'collections.myFavoriteCollection';
    return Promise.all([
        cache.setValue(prefix, null, {
            type: 'channel',
            common: {name: 'my favorite Collection'},
            native: {}
        }),
        cache.setValue(prefix + '.playThisCollection', false, {
            type: 'state',
            common: {
                name: 'press to play this collection',
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
                icon: 'icons/play_black.png'
            },
            native: {}
        }),
        cache.setValue(prefix + '.name','myFavoriteCollection', {
            type: 'state',
            common: {
                name: 'my favorite Collection',
                type: 'string',
                role: 'value',
                read: true,
                write: false
            },
            native: {}
        }),
    ])
    .then(() => getCollectionTracks())
    .then(collectionObject => {
        if (collectionObject.songs.length > 0) {
            let trackListValue = '';
            trackCount = collectionObject.songs.length;
            let StateSongId = cache.getValue('player.trackId');
            let songId = loadOrDefault(StateSongId, 'val', '');


            let stateName = collectionObject.trackIds.split(';');
            let stateArr = [];
            for (let i = 0; i < stateName.length; i++) {
                let ele = stateName[i].split(':');
                stateArr[ele[1]] = ele[0];
            }
            if (stateArr[songId] !== '' && (stateArr[songId] !== null)) {
                trackListValue = stateArr[songId];
            }

            const stateObj = {};
            const states = loadOrDefault(collectionObject, 'stateString', '').split(';');
            states.forEach(state => {
                let el = state.split(':');
                if (el && el.length === 2) {
                    stateObj[el[0]] = el[1];
                }
            });
            return Promise.all([
                cache.setValue(prefix + '.trackList', trackListValue, {
                    type: 'state',
                    common: {
                        name: 'Tracks of the collection saved in common part. Change this value to a track position number to start this collection with this track. First track is 0',
                        type: 'mixed',
                        role: 'value',
                        states: stateObj,
                        read: true,
                        write: true
                    },
                    native: {}
                }),
                cache.setValue(prefix + '.tracksTotal', trackCount, {
                    type: 'state',
                    common: {
                        name: 'count of tracks in this collection',
                        type: 'number',
                        role: 'value',
                        read: true,
                        write: false
                    },
                    native: {}
                }),
                cache.setValue('getCollection', false),
                createOrDefault(collectionObject, 'listNumber', prefix + '.trackListNumber', '',
                    'contains list of tracks as string, patter: 0;1;2;...',
                    'string'),
                createOrDefault(collectionObject, 'listString', prefix + '.trackListString', '',
                    'contains list of tracks as string, patter: title - artist;title - artist;title - artist;...',
                    'string'),
                createOrDefault(collectionObject, 'stateString', prefix + '.trackListStates', '',
                    'contains list of tracks as string with position, pattern: 0:title - artist;1:title - artist;2:title - artist;...',
                    'string'),
                createOrDefault(collectionObject, 'trackIdMap', prefix + '.trackListIdMap', '',
                    'contains list of track ids as string with position, pattern: 0:id;1:id;2:id;...',
                    'string'),
                createOrDefault(collectionObject, 'trackIds', prefix + '.trackListIds', '',
                    'contains list of track ids as string, pattern: id;id;id;...',
                    'string'),
                createOrDefault(collectionObject, 'songs', prefix + '.trackListArray', '',
                    'contains list of tracks as array object, pattern:\n[{id: "id",\ntitle: "title",\nartistName: "artistName1, artistName2",\nartistArray: [{id: "artistId", name: "artistName"}, {id: "artistId", name: "artistName"}, ...],\ndurationMs: 253844,\nduration: 4:13,\ndiscNumber: 1,\nexplicit: false, ...]', 'object')
            ]);
        }
    });
}

function getUsersCollection(){
    if (!isEmpty(application.userId)) {
        createCollections();
        cache.setValue('lastLoadCollection', Date.now());
    } else {
        adapter.log.warn('no userId');
        return Promise.reject('no userId');
    }
}

function getUsersPlaylist(offset, addedList) {
    addedList = addedList || [];

    if (!isEmpty(application.userId)) {
        //limit: 50 to minimize requests/min (max. 50)
        let query = {
            limit: 50,
            offset: offset
        };
        return sendRequest(`/v1/users/${application.userId}/playlists?${querystring.stringify(query)}`, 'GET', '')
            .then(parsedJson => createPlaylists(parsedJson, true, addedList))
            .catch(err => {
                addedList = null; //liste leeren sonst löschen der aktiven playlists bei error
                adapter.log.warn('getUsersPlaylist warn ' + err);
            });
    } else {
        adapter.log.warn('no userId');
        return Promise.reject('no userId');
    }
}

function loadPlaylistAppCache() {
    //lade playlists aus adapter für Vergleich snapshot_id, wenn vorhanden
    try {
        let statePl_ListId = loadOrDefault(cache.getValue('playlists.playlistListIds'), 'val', '');
        if (!isEmpty(statePl_ListId)) {
            playlistAppCache = [];
            let Pl_ListIds = statePl_ListId.split(';');
            let cnt = 0;
            for (let i = 0; i < Pl_ListIds.length; i++) {
                let prefix = 'playlists.' + Pl_ListIds[i];
                let appId = Pl_ListIds[i];
                let plId = loadOrDefault(cache.getValue(prefix + '.id'), 'val','');
                let plName = loadOrDefault(cache.getValue(prefix + '.name'), 'val','');
                let snapshot_id = loadOrDefault(cache.getValue(prefix + '.snapshot_id'),'val', '');
                let plImage = loadOrDefault(cache.getValue(prefix + '.imageUrl'), 'val', '');
                //let plImage64 = loadOrDefault(cache.getValue(prefix + '.imageUrl64'), 'val', '');
                let owner = loadOrDefault(cache.getValue(prefix + '.owner'), 'val', '');
                let trackCount = loadOrDefault(cache.getValue(prefix + '.tracksTotal'), 'val', '');
                let songs = loadOrDefault(cache.getValue(prefix + '.trackListArray'), 'val', []);     
                if (isEmpty(plId) || isEmpty(plName)) {
                    continue;
                }
                let plAppCache = {
                    appId: appId,
                    id: plId,
                    name: plName,
                    owner: owner,
                    snapshot_id: snapshot_id,
                    image: plImage,
                    tracksTotal: trackCount,
                    songs: songs
                };
                playlistAppCache.push(plAppCache);
                cnt++;
            }
            cache.setValue('loadPlaylistCache', false);
            adapter.log.debug('loadPlaylistAppCache gestartet playlist-count: ' + cnt);
        }
    } catch(err) {
        adapter.log.warn('error in loadPlaylistAppCache err: ' + err);
    }
    return;
}

function getPlaylistCacheItem(owner, playlistId) {
    if (!isEmpty(owner) && !isEmpty(playlistId) && playlistAppCache.length > 0) {
        let toFindId = shrinkStateName(owner + '-' + playlistId);
        let x = -1;
        for (let i = 0; i < playlistAppCache.length; i++){
            if (playlistAppCache[i].appId === toFindId) {
                x = i;
                break;
            }
        }
        //adapter.log.warn('x: ' + x + ' playlistCache: ' + playlistAppCache.length);
        if (x >= 0) {
            return x;
        } else {
            return -1;
        }
    }
} 

function getUsersAlbum(offset, addedList) {
    addedList = addedList || [];

    if (!isEmpty(application.userId)) {
        //limit: 50 to minimize requests/min (max. 50)
        let query = {
            limit: 50,
            offset: offset
        };
        return sendRequest(`/v1/me/albums?${querystring.stringify(query)}`, 'GET', '')
            .then(parsedJson => createAlbums(parsedJson, true, addedList))
            .catch(err => {
                addedList = null; //liste leeren sonst löschen der aktiven playlists bei error
                adapter.log.warn('getUsersAlbum warn ' + err);
            });
    } else {
        adapter.log.warn('no userId');
        return Promise.reject('no userId');
    }
}

function getUsersShows(offset, addedList) {
    addedList = addedList || [];

    if (!isEmpty(application.userId)) {
        //limit: 50 to minimize requests/min (max. 50)
        let query = {
            limit: 50,
            offset: offset
        };
        return sendRequest(`/v1/me/shows?${querystring.stringify(query)}`, 'GET', '')
            .then(parsedJson => createShows(parsedJson, true, addedList))
            .catch(err => {
                addedList = null; //liste leeren sonst löschen der aktiven playlists bei error
                adapter.log.warn('getUsersShows warn ' + err);
            });
    } else {
        adapter.log.warn('no userId');
        return Promise.reject('no userId');
    }
}

function getSelectedDevice(deviceData) {

    if (deviceData.lastActiveDeviceId === '') {
        //nutze letze deviceID vom player wenn vorhanden (nach Adapter-Neustart)
        let tmp_dev = cache.getValue('player.device.id');
        if (tmp_dev && tmp_dev.val !== '') {
            deviceData.lastActiveDeviceId = tmp_dev.val;
        } else if (deviceData.lastSelectDeviceId !== ''){
            adapter.log.debug('getSelectedDevice: lastSelect: ' + deviceData.lastSelectDeviceId);
            return deviceData.lastSelectDeviceId;
        }
            
        adapter.log.debug('getSelectedDevice: lastActive: ' + deviceData.lastActiveDeviceId);
        return deviceData.lastActiveDeviceId;
    } else {
        return deviceData.lastActiveDeviceId;
    }
}

function cleanState(str) {
    str = str.replace(/:/g, ' ');
    str = str.replace(/;/g, ' ');
    let old;
    do {
        old = str;
        str = str.replace('  ', ' ');
    }
    while (old !== str);
    return str.trim();
}

function unfollowPlaylist(playlistId) {
    //owner-playlistId or only playlistId
    if (!isEmpty(playlistId)) {
        let plID = '';
        if (playlistId.indexOf('-') >= 0) {
            let pl_tmp = playlistId.split('-');
            plID = pl_tmp[1];
        } else {
            plID = playlistId;
        }
        return sendRequest('/v1/playlists/'+ plID + '/followers', 'DELETE', '')
        .then(() => {
            //local playlist delete/refresh
            let delPlaylistState = cache.getValue('playlists.playlistListIds');
            if (delPlaylistState && delPlaylistState.val) {
                let delPl_lst = delPlaylistState.val.split(';');
                let lstObjId = '';
                for (let i = 0; i < delPl_lst.length; i++) {
                    let lstObj = delPl_lst[i].split('-');
                    if (lstObj[1] === plID) {
                        lstObjId = delPl_lst[i];
                        break;
                    }
                }
                if (!isEmpty(lstObjId)) {
                    adapter.log.warn('delete: ' + adapter.namespace + '.playlists.' + lstObjId);
                    let states = cache.getValue('playlists.' + lstObjId + '.*');
                    let keys = Object.keys(states);
                    let fn = function (key) {
                        key = removeNameSpace(key);
                        return cache.delObject(key)
                        .then(() => {
                            //adapter.log.warn('lösche: ' + key);
                            if (key.endsWith('.id')) {
                                return cache.delObject(key.substring(0, key.length - 3));
                            }
                        });
                    };
                    return Promise.all(keys.map(fn))
                    .then(() => {
                        btnClearCache();
                        btnRefreshPlaylistList();
                        cache.setValue('unfollowPlaylistId', {val: playlistId, ack: true});
                    });
                }
            }
            //mit Löschen der alten PlaylistLists
            //btnRefreshPlaylistList();
        })
        .catch(err => adapter.log.warn('unfollowPlaylist err: ' + err));
    } else {
        adapter.log.warn('unfollowPlaylist no playlistId');
    }
}

function unfollowAlbum(albumId) {
    if (!isEmpty(albumId)) {
        return sendRequest('/v1/me/albums?ids=' + albumId, 'DELETE', '')
        .then(() => {
            adapter.log.warn('delete: ' + adapter.namespace + '.albums.' + albumId);
            let states = cache.getValue('albums.' + albumId + '.*');
            let keys = Object.keys(states);
            let fn = function (key) {
                key = removeNameSpace(key);
                return cache.delObject(key)
                .then(() => {
                    //adapter.log.warn('lösche: ' + key);
                    if (key.endsWith('.id')) {
                        return cache.delObject(key.substring(0, key.length - 3));
                    }
                });
            };
            return Promise.all(keys.map(fn));    
        })
        .then(() => {
            btnClearCache();
            btnRefreshAlbumList();
            //löschen der alten Daten dann neu anlegen
            cache.setValue('unfollowAlbumId', {val: albumId, ack: true});
        })
        .catch(err => adapter.log.warn('unfollowAlbum err: ' + err));
    } else {
        adapter.log.warn('unfollowAlbum no albumId');
    }
}

function unfollowShow(showId) {
    if (!isEmpty(showId)) {
        return sendRequest('/v1/me/shows?ids=' + showId, 'DELETE', '')
        .then(() => {
            adapter.log.warn('delete: ' + adapter.namespace + '.shows.' + showId);
            let states = cache.getValue('shows.' + showId + '.*');
            let keys = Object.keys(states);
            let fn = function (key) {
                key = removeNameSpace(key);
                return cache.delObject(key)
                .then(() => {
                    //adapter.log.warn('lösche: ' + key);
                    if (key.endsWith('.id')) {
                        return cache.delObject(key.substring(0, key.length - 3));
                    }
                });
            };
            return Promise.all(keys.map(fn));    
        })
        .then(() => {
            btnClearCache();
            btnRefreshShowList();
            //löschen der alten Listen und neu anlegen
            cache.setValue('unfollowShowId', {val: showId, ack: true});
        })
        .catch(err => adapter.log.warn('unfollowShow err: ' + err));
    } else {
        adapter.log.warn('unfollowShow no showId');
    }
}

function deleteTrackInCollection(trackId) {
    if (isEmpty(trackId)) {
        return adapter.log.warn('deleteTrackInCollection empty trackId');
    }
    const query = {
        ids: trackId
    };
    return sendRequest(`/v1/me/tracks?${querystring.stringify(query)}`, 'DELETE', '')
    .then(() => {
        createCollections();
        checkTrackInCollection();
    })
    .catch(err => adapter.log.warn('deleteTrackInCollection err: ' + err)); 
}

function addTrackToCollection(trackId) {
    if (isEmpty(trackId)) {
        return adapter.log.warn('addTrackToCollection empty trackId');
    }
    const query = {
        ids: trackId
    };
    return sendRequest(`/v1/me/tracks?${querystring.stringify(query)}`, 'PUT', '')
    .then(() => {
        createCollections();
        checkTrackInCollection();
    })
    .catch(err => adapter.log.warn('addTrackToCollection err: ' + err));
}

function checkForTrackInCollection() {
    if (!isEmpty(lastTrackId)) {
        checkTrackInCollection(lastTrackId);
        return cache.setValue('player.trackIsFavorite', trackIsFav);
    }
}

 async function checkTrackInCollection(trackId) {
    let ret = false;
    if (!isEmpty(trackId)) {
        const query = {
            ids: trackId
        };
        try {
            const data = await sendRequest(`/v1/me/tracks/contains?${querystring.stringify(query)}`, 'GET', '');
            if (!isEmpty(data)) {
                //adapter.log.warn('data: ' + data);
                if (data == 'true') {
                    trackIsFav = true;
                    ret = true;
                } else {
                    trackIsFav = false;
                }
            }
        } catch(err) {
            adapter.log.warn('checkTrackInCollection err: ' + err);
        }   
    }
    return ret;
}

async function getShowEpisodes(showid) {
    if (isEmpty(showid)) {
        return adapter.log.warn('getShowEpisodes empty showid');
    }
    const showObject = {
        stateString: '',
        listString: '',
        listNumber: '',
        episodeIdMap: '',
        episodeImageUrl64: '',
        episodeIds: '',
        episodeDuration_msList: '',
        episodes: []
    }
    let offset = 0;
    while(true) {
        const query = {
            limit: 50,
            offset: offset
        };
        try {
            const data = await sendRequest(`/v1/shows/${showid}?${querystring.stringify(query)}`, 'GET', ''); 
            let i = offset;
            let no = i;
            if (!isEmpty(data)) {
                let showDescription = loadOrDefault(data, 'description', '');
                let showExplicit = loadOrDefault(data, 'explicit', false);
                let showImages = loadOrDefault(data, 'images[0].url', '');
                let showImage64 = loadOrDefault(data, 'images[2].url', '');
                let showName = loadOrDefault(data, 'name', '');
                let showPublisher = loadOrDefault(data, 'publisher', '');
                let showTotal_episodes = loadOrDefault(data, 'total_episodes', 0);
                let showType = loadOrDefault(data, 'type', '');
                let showUri = loadOrDefault(data, 'uri', '');
                //adapter.log.warn('count item: ' + data.episodes.items.length);
                if (data.episodes && data.episodes.items && data.episodes.items.length > 0) {
                    data.episodes.items.forEach(item => {
                        let episodesId = loadOrDefault(item, 'id', ''); 
                        no = i;
                        if (isEmpty(episodesId)) {
                            return adapter.log.debug(
                                `There was a show episode ignored because of missing id; episodesId: ${episodesId}; no: ${no}`);
                        }
                        let description = loadOrDefault(item, 'description', '');
                        let duration_ms = loadOrDefault(item, 'duration_ms', 0);
                        let explicit = loadOrDefault(item, 'explicit', false);
                        let is_playable = loadOrDefault(item, 'is_playable', false);
                        let images = loadOrDefault(item, 'images[0].url', '');
                        let imageUrl64 = loadOrDefault(item, 'images[2].url', '');
                        let language = loadOrDefault(item, 'language', '');
                        let name = loadOrDefault(item, 'name', '');
                        let release_date = loadOrDefault(item, 'release_date', '');
                        let release_date_precision = loadOrDefault(item, 'release_date_precision', '');
                        let type = loadOrDefault(item, 'type', '');
                        let uri = loadOrDefault(item, 'uri', '');
                    
                        if (showObject.episodes.length > 0) {
                            showObject.stateString += ';';
                            showObject.listString += ';';
                            showObject.episodeIdMap += ';';
                            showObject.episodeImageUrl64 += ';',
                            showObject.episodeDuration_msList += ';';
                            showObject.episodeIds += ';';
                            showObject.listNumber += ';';
                        }
                        let tmpstate = no + ':' + name;
                        let tmpids = no + ':' + episodesId;
                        showObject.stateString += tmpstate;
                        showObject.listString += name;
                        showObject.episodeIdMap += tmpids;
                        showObject.episodeImageUrl64 += imageUrl64;
                        showObject.episodeDuration_msList += duration_ms;
                        showObject.episodeIds += episodesId;
                        showObject.listNumber += no;
                        let a = {
                            id: episodesId,
                            episodeName: name,
                            publisher: showPublisher,
                            description: description,
                            duration_ms: duration_ms,
                            duration: convertToDigiClock(duration_ms),
                            release_date: release_date,
                            release_date_precision: release_date_precision,
                            language: language,
                            images: images,
                            imageUrl64: imageUrl64,
                            explicit: explicit,
                            type: type,
                            uri: uri,
                            is_playable: is_playable
                        };
                        showObject.episodes.push(a);
                        i++;                  
                }); 
            }   
            }
            if (offset + 50 < data.total_episodes) {
                offset += 50;
            } else {
                break;
            }
        } catch(err) {
            adapter.log.warn('error on load episodes(getShowEpisodes): ' + err + ' showid: ' + showid);
            break;
        }
    }
    return showObject;
}

async function getPlaylistTracks(owner, id, plName) {
    const playlistObject = {
        stateString: '',
        listString: '',
        listNumber: '',
        trackIdMap: '',
        imageUrl64Map: '',
        imageAlbumUrlMap: '',
        trackIds: '',
        songs: []
    };
    let offset = 0;
    let currentNo = 0;
    let currentTrack = '';
    let regParam = `${owner}/playlists/${id}/tracks`;
    while (true) {
        const query = {
        limit: 50,
        offset: offset
        };
        try {
            const data = await sendRequest(`/v1/users/${regParam}?${querystring.stringify(query)}`, 'GET', '');
            let i = offset;
            let no = i;
            if (!isEmpty(data) && !isEmpty(data.items) && data.items.length > 0) {
                data.items.forEach(item => {
                    let trackId = loadOrDefault(item, 'track.id', ''); 
                    no = i;
                    currentNo = no;
                    if (isEmpty(trackId)) {
                        return adapter.log.debug(
                            `There was a playlist track ignored because of missing id; playlist: ${id}; track no: ${no}`);
                    }
                    let favoriteLstState = cache.getValue('collections.myFavoriteCollection.trackListIds');
                    let fav_ix = -1;
                    let isFavorite = false;
                    if (favoriteLstState && favoriteLstState.val) {
                        let favLst = favoriteLstState.val.split(';');
                        //adapter.log.warn('favLst: '+ favLst.length + ' trackId: ' + trackId);
                        if (favLst.length > 0) {
                            fav_ix = favLst.indexOf(trackId);
                        }
                        //adapter.log.warn('fav_ix: ' + fav_ix);
                        if (fav_ix >= 0) {
                            isFavorite = true;
                        }
                    }
                    let artist = getArtistNamesOrDefault(item, 'track.artists');
                    let artistArray = getArtistArrayOrDefault(item, 'track.artists');
                    let trackName = loadOrDefault(item, 'track.name', '');
                    let trackDuration = loadOrDefault(item, 'track.duration_ms', 0);
                    let addedAt = loadOrDefault(item, 'addedAt', '');
                    let addedBy = loadOrDefault(item, 'addedBy', '');
                    let trackAlbumId = loadOrDefault(item, 'track.album.id', '');
                    let trackAlbumName = loadOrDefault(item, 'track.album.name', '');
                    let trackAlbumImgUrl = loadOrDefault(item, 'track.album.images[0].url', '');
                    let trackImageUrl64 = loadOrDefault(item, 'track.album.images[2].url');
                    let trackDiscNumber = loadOrDefault(item, 'track.disc_number', 1);
                    let trackEpisode = loadOrDefault(item, 'track.episode', false);
                    let trackExplicit = loadOrDefault(item, 'track.explicit', false);
                    let trackPopularity = loadOrDefault(item, 'track.popularity', 0);
                    let trackIsPlayable = loadOrDefault(item, 'track.is_playable', false);
                    currentTrack = trackName;
                    if (playlistObject.songs.length > 0) {
                        playlistObject.stateString += ';';
                        playlistObject.listString += ';';
                        playlistObject.trackIdMap += ';';
                        playlistObject.imageUrl64Map += ';';
                        playlistObject.imageAlbumUrlMap += ';';
                        playlistObject.trackIds += ';';
                        playlistObject.listNumber += ';';
                    }
                    playlistObject.stateString += no +':' + trackName + '-' + artist;
                    playlistObject.listString += trackName + '-' + artist;
                    playlistObject.trackIdMap += no + ':' + trackId;
                    playlistObject.imageUrl64Map += trackImageUrl64;
                    playlistObject.imageAlbumUrlMap += trackAlbumImgUrl;
                    playlistObject.trackIds += trackId;
                    playlistObject.listNumber += no;
                    let a = {
                        id: trackId,
                        title: trackName,
                        artistName: artist,
                        artistArray: artistArray,
                        album: {id: trackAlbumId, name: trackAlbumName},
                        imageUrl64: trackImageUrl64,
                        imageAlbumUrl: trackAlbumImgUrl,
                        durationMs: trackDuration,
                        duration: convertToDigiClock(trackDuration),
                        addedAt: addedAt,
                        addedBy: addedBy,
                        discNumber: trackDiscNumber,
                        episode: trackEpisode,
                        explicit: trackExplicit,
                        popularity: trackPopularity,
                        isFavorite: isFavorite,
                        is_playable: trackIsPlayable
                    };
                    playlistObject.songs.push(a);
                    i++;                  
                });
            } else {
                break;
            }
            if (offset + 50 < data.total) {
                    offset += 50;
            } else {
                break;
            }
        
        //.catch(err => adapter.log.warn('error on load tracks: ' + err));
        } catch(err) {
            adapter.log.warn('error on load tracks(getPlaylistTracks): ' + err + ' owner: ' + owner + ' id: ' + id + ' bei Playlist: ' + plName);
            break;
        }
    }
    adapter.log.debug('PlaylistFound: ' + pl_foundCount + ' playlistNotFound: ' + pl_notFoundCount + ' /Track-Daten geladen für playlist: ' + owner + '-' + id + ' ' + plName);
    return playlistObject;
}

async function getAlbumTracks(albumId) {
    const albumObject = {
        stateString: '',
        listString: '',
        listNumber: '',
        trackIdMap: '',
        trackIds: '',
        songs: []
    };
    let offset = 0;
    let owner = application.userId;
    let regParam = `${owner}/albums/${albumId}/tracks`;
    while (true) {
        const query = {
        limit: 50,
        offset: offset
        };
        try {
            const data = await sendRequest(`/v1/albums/${albumId}/tracks?${querystring.stringify(query)}`, 'GET', '');
            let i = offset;
            let no = i;
            //adapter.log.warn('trackData: ' + querystring.stringify(data.items));
            if (data && data.items && data.items.length > 0) {
                data.items.forEach(item => {
                    let trackId = loadOrDefault(item, 'id', ''); 
                    no = i;
                    if (isEmpty(trackId)) {
                        return adapter.log.debug(
                            `There was a album track ignored because of missing id; album: ${albumId}; track no: ${no}`);
                    }
                    let favoriteLstState = cache.getValue('collections.myFavoriteCollection.trackListIds');
                    let fav_ix = -1;
                    let isFavorite = false;
                    if (favoriteLstState && favoriteLstState.val) {
                        let favLst = favoriteLstState.val.split(';');
                        if (favLst.length > 0) {
                            fav_ix = favLst.indexOf(trackId);
                        }
                        if (fav_ix >= 0) {
                            isFavorite = true;
                        }
                    }
                    let artist = getArtistNamesOrDefault(item, 'artists');
                    let artistArray = getArtistArrayOrDefault(item, 'artists');
                    let trackName = loadOrDefault(item, 'name', '');
                    let trackDuration = loadOrDefault(item, 'duration_ms', 0);
                    let trackDiscNumber = loadOrDefault(item, 'disc_number', 1);
                    let trackExplicit = loadOrDefault(item, 'explicit', false);
                    let track_number = loadOrDefault(item, 'track_number', 0);
                    if (albumObject.songs.length > 0) {
                        albumObject.stateString += ';';
                        albumObject.listString += ';';
                        albumObject.trackIdMap += ';';
                        albumObject.trackIds += ';';
                        albumObject.listNumber += ';';
                    }
                    let tmpStr = no + ':' + trackName + '-' + artist;
                    albumObject.stateString += tmpStr;
                    albumObject.listString += trackName + '-' + artist;
                    albumObject.trackIdMap += no + ':' + trackId;
                    albumObject.trackIds += trackId;
                    albumObject.listNumber += no;
                    let a = {
                        id: trackId,
                        title: trackName,
                        artistName: artist,
                        artistArray: artistArray,
                        durationMs: trackDuration,
                        duration: convertToDigiClock(trackDuration),
                        discNumber: trackDiscNumber,
                        explicit: trackExplicit,
                        isFavorite: isFavorite,
                        track_number: track_number
                    };
                    albumObject.songs.push(a);
                    i++;                  
                });
            } else {
                break;
            }
            if (offset + 50 < data.total) {
                    offset += 50;
            } else {
                break;
            }
        
        } catch(err) {
            adapter.log.warn('error in function getAlbumTracks: ' + err + ' AlbumId: ' + albumId);
            break;
        }
    }
    return albumObject;
}

function btnLoadQueue() {
    if (!isPlaying) {
        cache.setValue('player.queueArray', {});
        return;
    }
     return Promise.all([
        cache.setValue('player.queueArray', {})
    ])
    .then(() => {
        getQueueTracks()
        .then(queueObject => {
            if (queueObject.songs.length > 0) {
                return Promise.all([
                    createOrDefault(queueObject, 'songs', 'player.queueArray', '',
                    'contains list of tracks as array object, pattern:\n[{id: "id",\ntitle: "title",\nartistName: "artistName",\nartistArray: [{id: "artistId", name: "artistName"}, {id: "artistId", name: "artistName"}, ...],\ndurationMs: 253844,\nduration: 4:13,\ndiscNumber: 1,\nexplicit: false, ...]', 'object')
                ])
            }
        })
    })
    .catch(err => adapter.log.warn('btnLoadQueue err: ' + err));
}

async function getQueueTracks() {
    const queueObject = {
        stateString: '',
        listString: '',
        listNumber: '',
        trackIdMap: '',
        trackIds: '',
        songs: []
    };

    try {
        const data = await sendRequest('/v1/me/player/queue', 'GET', '');
        let no = 0;
        //adapter.log.warn('trackData: ' + querystring.stringify(data.queue));
        //first item is currently_playing -> queue
        if (data && data.queue && data.currently_playing && data.queue.length > 0) {
            //currently_playing
            let trackId = loadOrDefault(data.currently_playing, 'id', ''); 
            if (isEmpty(trackId)) {
                return adapter.log.warn(
                    `There was a currently_playing track ignored because of missing id; track no: ${no}`);
            }
            let artist = getArtistNamesOrDefault(data.currently_playing, 'artists');
            let artistArray = getArtistArrayOrDefault(data.currently_playing, 'artists');
            let trackName = loadOrDefault(data.currently_playing, 'name', '');
            let albumName = loadOrDefault(data.currently_playing.album, 'name', '');
            let albumId = loadOrDefault(data.currently_playing.album, 'id', '');
            let trackType = loadOrDefault(data.currently_playing, 'type', '');
            let trackImgUrl64 = '';
            if (trackType === 'episode') {
                trackImgUrl64 = loadOrDefault(data.currently_playing, 'images[2].url', '');    
            } else {
                trackImgUrl64 = loadOrDefault(data.currently_playing.album, 'images[2].url', '');
            }
            let trackDuration = loadOrDefault(data.currently_playing, 'duration_ms', 0);
            let trackDiscNumber = loadOrDefault(data.currently_playing, 'disc_number', 1);
            let trackExplicit = loadOrDefault(data.currently_playing, 'explicit', false);
            let trackPopularity = loadOrDefault(data.currently_playing, 'popularity',0);
            let track_number = loadOrDefault(data.currently_playing, 'track_number', 0);
            let track_uri = loadOrDefault(data.currently_playing, 'uri', '');
            if (queueObject.songs.length > 0) {
                queueObject.stateString += ';';
                queueObject.listString += ';';
                queueObject.trackIdMap += ';';
                queueObject.trackIds += ';';
                queueObject.listNumber += ';';
            }
            let tmpStr = no + ':' + trackName + '-' + artist;
            queueObject.stateString += tmpStr;
            queueObject.listString += trackName + '-' + artist;
            queueObject.trackIdMap += no + ':' + trackId;
            queueObject.trackIds += trackId;
            queueObject.listNumber += no;
            let a = {
                id: trackId,
                title: trackName,
                artistName: artist,
                artistArray: artistArray,
                albumName: albumName,
                albumId: albumId,
                imageUrl64: trackImgUrl64,
                durationMs: trackDuration,
                duration: convertToDigiClock(trackDuration),
                discNumber: trackDiscNumber,
                popularity: trackPopularity,
                explicit: trackExplicit,
                track_number: track_number,
                uri: track_uri
            };
            queueObject.songs.push(a);
            no++;
            //queue            
            data.queue.forEach(item => {
                let trackId = loadOrDefault(item, 'id', ''); 
                if (isEmpty(trackId)) {
                    return adapter.log.warn(
                        `There was a queue track ignored because of missing id; track no: ${no}`);
                }
                
                let artist = getArtistNamesOrDefault(item, 'artists');
                let artistArray = getArtistArrayOrDefault(item, 'artists');
                let trackName = loadOrDefault(item, 'name', '');
                let albumId = loadOrDefault(item.album, 'id', '');
                let trackType = loadOrDefault(item, 'type', '');
                let trackImgUrl64 = '';
                if (trackType === 'episode') {
                    trackImgUrl64 = loadOrDefault(item, 'images[2].url', '');
                } else {
                    trackImgUrl64 = loadOrDefault(item.album, 'images[2].url', '');
                }
                let albumName = loadOrDefault(item.album, 'name', '');
                let trackDuration = loadOrDefault(item, 'duration_ms', 0);
                let trackDiscNumber = loadOrDefault(item, 'disc_number', 1);
                let trackExplicit = loadOrDefault(item, 'explicit', false);
                let trackPopularity = loadOrDefault(item, 'popularity',0);
                let track_number = loadOrDefault(item, 'track_number', 0);
                let track_uri = loadOrDefault(item, 'uri', '');
                if (queueObject.songs.length > 0) {
                    queueObject.stateString += ';';
                    queueObject.listString += ';';
                    queueObject.trackIdMap += ';';
                    queueObject.trackIds += ';';
                    queueObject.listNumber += ';';
                }
                let tmpStr = no + ':' + trackName + '-' + artist;
                queueObject.stateString += tmpStr;
                queueObject.listString += trackName + '-' + artist;
                queueObject.trackIdMap += no + ':' + trackId;
                queueObject.trackIds += trackId;
                queueObject.listNumber += no;
                let a = {
                    id: trackId,
                    title: trackName,
                    artistName: artist,
                    artistArray: artistArray,
                    albumName: albumName,
                    albumId: albumId,
                    imageUrl64: trackImgUrl64,
                    durationMs: trackDuration,
                    duration: convertToDigiClock(trackDuration),
                    discNumber: trackDiscNumber,
                    popularity: trackPopularity,
                    explicit: trackExplicit,
                    track_number: track_number,
                    uri: track_uri
                };
                queueObject.songs.push(a);
                no++;                  
            });
        }
        
    } catch(err) {
        adapter.log.warn('error in function getQueueTracks: ' + err);
    }
    return queueObject;
}

async function getCollectionTracks() {
    const collectionObject = {
        stateString: '',
        listString: '',
        listNumber: '',
        trackIdMap: '',
        trackIds: '',
        songs: []
    };

    let offset = 0;
    let trackCount = 0;
    while (true) {
        const query = {
        limit: 50,
        offset: offset
        };
        try {
            const data = await sendRequest(`/v1/me/tracks?${querystring.stringify(query)}`, 'GET', '');
            let i = offset;
            let no = i;
            //adapter.log.warn('trackData: ' + querystring.stringify(data.items));
            if (data && data.items && data.items.length > 0) {
                trackCount = loadOrDefault(data, 'total', 0);
                data.items.forEach(item => {
                    let trackId = loadOrDefault(item.track, 'id', ''); 
                    no = i;
                    if (isEmpty(trackId)) {
                        return adapter.log.warn(
                            `There was a collection track ignored because of missing id; track no: ${no}`);
                    }
                    
                    let artist = getArtistNamesOrDefault(item.track, 'artists');
                    let artistArray = getArtistArrayOrDefault(item.track, 'artists');
                    let trackName = loadOrDefault(item.track, 'name', '');
                    let trackImgUrl64 = loadOrDefault(item.track.album, 'images[2].url', '');
                    let trackDuration = loadOrDefault(item.track, 'duration_ms', 0);
                    let trackDiscNumber = loadOrDefault(item.track, 'disc_number', 1);
                    let trackExplicit = loadOrDefault(item.track, 'explicit', false);
                    let trackPopularity = loadOrDefault(item.track, 'popularity',0);
                    let track_number = loadOrDefault(item.track, 'track_number', 0);
                    if (collectionObject.songs.length > 0) {
                        collectionObject.stateString += ';';
                        collectionObject.listString += ';';
                        collectionObject.trackIdMap += ';';
                        collectionObject.trackIds += ';';
                        collectionObject.listNumber += ';';
                    }
                    let tmpStr = no + ':' + trackName + '-' + artist;
                    collectionObject.stateString += tmpStr;
                    collectionObject.listString += trackName + '-' + artist;
                    collectionObject.trackIdMap += no + ':' + trackId;
                    collectionObject.trackIds += trackId;
                    collectionObject.listNumber += no;
                    let a = {
                        id: trackId,
                        title: trackName,
                        artistName: artist,
                        artistArray: artistArray,
                        imageUrl64: trackImgUrl64,
                        durationMs: trackDuration,
                        duration: convertToDigiClock(trackDuration),
                        discNumber: trackDiscNumber,
                        popularity: trackPopularity,
                        explicit: trackExplicit,
                        track_number: track_number
                    };
                    collectionObject.songs.push(a);
                    i++;                  
                });
            } else {
                break;
            }
            if (offset + 50 < data.total) {
                    offset += 50;
            } else {
                break;
            }
        
        } catch(err) {
            adapter.log.warn('error in function getCollectionTracks: ' + err);
            break;
        }
    }
    return collectionObject;
}

async function getTrackInfo(trackId) {
    if (isEmpty(trackId)) {
        adapter.log.warn('error in getTrackInfo - no trackId');
        return false;
    }
    try {
        const data = await sendRequest(`/v1/tracks/${trackId}`, 'GET', '');
        if (data) {
            let albumId = loadOrDefault(data.album, 'id', '');
            let albumName = loadOrDefault(data.album, 'name','');
            let albumTotalTracks = loadOrDefault(data.album, 'total_tracks', 0);
            let albumRelease = loadOrDefault(data.album, 'release_date', '');
            let albumImgUrl = loadOrDefault(data.album.images[0], 'url', '');
            let albumImg64Url = loadOrDefault(data.album.images[2], 'url', '');
            let albumArtist = getArtistNamesOrDefault(data.album, 'artists');
            let albumArtistArray = getArtistArrayOrDefault(data.album, 'artists');
            let trackArtist = getArtistNamesOrDefault(data, 'artists');
            let trackArtistArray = getArtistArrayOrDefault(data, 'artists');
            let explicit = loadOrDefault(data, 'explicit', false);
            let popularity = loadOrDefault(data, 'popularity', 0);
            let trackName = loadOrDefault(data, 'name', '');
            let trackNr = loadOrDefault(data, 'track_number', 0);
            let trackDuration_ms = loadOrDefault(data, 'duration_ms', 0);
            let trackDiscNr = loadOrDefault(data, 'disc_number', 0);
            cache.setValue('trackInfoTrackId', {
                val: {
                    AlbumId: albumId,
                    AlbumName: albumName,
                    AlbumTracksTotal: albumTotalTracks,
                    AlbumRelease: albumRelease,
                    AlbumImgUrl: albumImgUrl,
                    AlbumImg64Url: albumImg64Url,
                    AlbumArtist: albumArtist,
                    AlbumArtistArray: albumArtistArray,
                    TrackName: trackName,
                    TrackArtist: trackArtist,
                    TrackArtistArray: trackArtistArray,
                    TrackNr: trackNr,
                    Duration_ms: trackDuration_ms,
                    Explicit: explicit,
                    Popularity: popularity,
                    DiscNr: trackDiscNr
                }, ack: true});
        }
    } catch(err) {
        adapter.log.warn('error in function getTrackInfo: ' + err);
        return false;
    }
    return true;
}

async function getArtistInfo(artistId) {
    if (isEmpty(artistId)){
        adapter.log.warn('error in getArtistInfo - no artistId');
        return false;
    }
    try {
        const data = await sendRequest(`/v1/artists/${artistId}`, 'GET', '');
        //adapter.log.warn('data: ' + JSON.stringify(data));
        if (data) {
            let artistName = loadOrDefault(data, 'name', '');
            let popularity = loadOrDefault(data, 'popularity', 0);
            let genres = loadOrDefault(data, 'genres[0]' , '');
            let imageUrl = loadOrDefault(data, 'images[0].url', '');
            let image64Url = loadOrDefault(data, 'images[2].url', '');
            cache.setValue('artistInfoArtistId', {
                val: {
                    ArtistName: artistName,
                    Popularity: popularity,
                    Genres: genres,
                    ImageUrl: imageUrl,
                    Image64Url: image64Url
                }, ack: true});
        }
    } catch(err) {
        adapter.log.warn('error in function getArtistInfo: ' + err);
        return false;
    }
    return true;
}

function reloadDevices(data) {
    return createDevices(data)
        .then(addedList => {
            let p;
            if (application.deleteDevices) {
                p = deleteDevices(addedList);
            } else {
                p = disableDevices(addedList);
            }
            return p
                .then(() => {
                    refreshDeviceList();
                    cache.setValue('getDevices', {val: false, ack: true});
                });
        });
}

function disableDevices(addedList) {
    let states = cache.getValue('devices.*');
    let keys = Object.keys(states);
    let fn = function (key) {
        key = removeNameSpace(key);
        let found = false;
        if (addedList) {
            for (let i = 0; i < addedList.length; i++) {
                if (key.startsWith(addedList[i])) {
                    found = true;
                    break;
                }
            }
        }
        if (!found && key.endsWith('.isAvailable')) {
            return cache.setValue(key, false);
        }
    };
    return Promise.all(keys.map(fn));
}

function deleteDevices(addedList) {
    let states = cache.getValue('devices.*');
    let keys = Object.keys(states);
    let fn = function (key) {
        key = removeNameSpace(key);
        let found = false;
        if (addedList) {
            for (let i = 0; i < addedList.length; i++) {
                if (key.startsWith(addedList[i])) {
                    found = true;
                    break;
                }
            }
        }

        if (!found &&
            key !== 'devices.deviceList' &&
            key !== 'devices.deviceListIds' &&
            key !== 'devices.deviceListString' &&
            key !== 'devices.availableDeviceListIds' &&
            key !== 'devices.availableDeviceListString') {
            return cache.delObject(key)
                .then(() => {
                    if (key.endsWith('.id')) {
                        return cache.delObject(key.substring(0, key.length - 3));
                    }
                });
        }
    };
    return Promise.all(keys.map(fn));
}

function getIconByType(type) {
    if (type === 'Computer') {
        return 'icons/computer_black.png';
    } else if (type === 'Smartphone') {
        return 'icons/smartphone_black.png';
    }
    // Speaker
    return 'icons/speaker_black.png';
}

function createDevices(data) {
    if (isEmpty(data) || isEmpty(data.devices)) {
        data = {devices: []};
    }
    let addedList = [];
    let fn = function (device) {
        let deviceId = loadOrDefault(device, 'id', '');
        let deviceName = loadOrDefault(device, 'name', '');
        if (isEmpty(deviceName)) {
            adapter.log.warn('empty device name');
            return Promise.reject('empty device name');
        }
        let name = '';
        if (deviceId != null) {
            name = shrinkStateName(deviceId);
        } else {
            name = shrinkStateName(deviceName);
        }
        let prefix = 'devices.' + name;
        addedList.push(prefix);

        let isRestricted = loadOrDefault(device, 'is_restricted', false);
        let useForPlayback;
        if (!isRestricted) {
            useForPlayback = cache.setValue(prefix + '.useForPlayback', false, {
                type: 'state',
                common: {
                    name: 'press to use device for playback (only for non restricted devices)',
                    type: 'boolean',
                    role: 'button',
                    read: false,
                    write: true,
                    icon: 'icons/play_black.png'
                },
                native: {}
            });
        } else {
            useForPlayback = cache.delObject(prefix + '.useForPlayback');
        }
        return Promise.all([
            cache.setValue(prefix, null, {
                type: 'device',
                common: {
                    name: deviceName,
                    icon: getIconByType(loadOrDefault(device, 'type', 'Computer'))
                },
                native: {}
            }),
            createOrDefault(device, 'id', prefix + '.id', '', 'device id', 'string'),
            createOrDefault(device, 'is_active', prefix + '.isActive', false, 'current active device', 'boolean'),
            createOrDefault(device, 'is_restricted', prefix + '.isRestricted', false, 'it is not possible to control restricted devices with the adapter', 'boolean'),
            createOrDefault(device, 'name', prefix + '.name', '', 'device name', 'string'),
            createOrDefault(device, 'type', prefix + '.type', 'Speaker', 'device type', 'string',
                {Computer: 'Computer', Smartphone: 'Smartphone', Speaker: 'Speaker'}
            ),
            createOrDefault(device, 'volume_percent', prefix + '.volume', '', 'volume in percent',
                'number'),
            cache.setValue(prefix + '.isAvailable', true, {
                type: 'state',
                common: {
                    name: 'can used for playing',
                    type: 'boolean',
                    role: 'value',
                    read: true,
                    write: false
                },
                native: {}
            }),
            useForPlayback
        ]);
    };
    return Promise.all(data.devices.map(fn))
        .then(() => addedList);
}

function refreshShowsList() {
    let a = [];
    let states = cache.getValue('shows.*');
    let keys = Object.keys(states);
    let fn = function (key) {
        if (!states[key] || !key.endsWith('.name')) {
            return;
        }
        let normKey = removeNameSpace(key);
        let id = normKey.substring(6, normKey.length - 5);
        a.push({
            id: id,
            name: states[key].val
        });
    };

    return Promise.all(keys.map(fn))
        .then(() => {
            a.sort(function (l, u){
                return l['name'].toLowerCase().localeCompare(u['name'].toLowerCase());
            });
            let stateList = {};
            let listIds = '';
            let listString = '';
            for (let i = 0, len = a.length; i < len; i++) {
                let normId = a[i].id;
                let normName = cleanState(a[i].name);
                if (listIds.length > 0) {
                    listIds += ';';
                    listString += ';';
                }
                stateList[normId] = normName;
                listIds += normId;
                listString += normName;
            }
            return Promise.all([
                setObjectStatesIfChanged('shows.showList', stateList),
                cache.setValue('shows.showListIds', listIds),
                cache.setValue('shows.showListString', listString)
            ]);
        })
        .then(() => {
            let id = cache.getValue('player.show.id');
            if (id && id.val && id.val !== null) {
                return cache.setValue('shows.showList', id.val);
            }
        })
        .catch(err => adapter.log.warn('refreshShowList err: ' + err));
}

function btnRefreshPlaylistList() {
    return Promise.all([
        cache.setValue('playlists.playlistListIds', ''),
        cache.setValue('playlists.playlistListString', ''),
        cache.setValue('playlists.yourPlaylistListIds', ''),
        cache.setValue('playlists.yourPlaylistListString', ''),
        setObjectStatesIfChanged('playlists.playlistList', {})
    ])
    .then(() => {
        if (isEmpty(cache.getValue('playlists.playlistListIds').val)) {
            adapter.log.debug('playlistList... in playlists wurden gelöscht!');
        }
        refreshPlaylistList();
        cache.setValue('refreshPlaylistList', {val: false, ack: true});
    })
    .catch(err => adapter.log.warn('btnRefreshPlaylistList err: ' + err));
}

function btnRefreshShowList() {
    return Promise.all([
        setObjectStatesIfChanged('shows.showList', {}),
        cache.setValue('shows.showListIds', ''),
        cache.setValue('shows.showListString', '')
    ])
    .then(() => {
        refreshShowsList();
        cache.setValue('refreshShowList', {val: false, ack: true});
    })
    .catch(err => adapter.log.warn('btnRefreshShowList err: ' + err));
}

function btnRefreshDeviceList() {
    return Promise.all([
        setObjectStatesIfChanged('devices.deviceList', {}),
        cache.setValue('devices.deviceListIds', ''),
        cache.setValue('devices.deviceListString', ''),
        cache.setValue('devices.availableDeviceListIds', ''),
        cache.setValue('devices.availableDeviceListString', '')
    ])
    .then(() => {
        refreshDeviceList();
        cache.setValue('refreshDeviceList', {val: false, ack: true});
    })
    .catch(err => adapter.log.warn('btnRefreshDeviceList err: ' + err));
}

function refreshPlaylistList() {
    let a = [];
    let states = cache.getValue('playlists.*');
    let keys = Object.keys(states);
    let fn = function (key) {
        if (!states[key] || !key.endsWith('.name')) {
            return;
        }
        let normKey = removeNameSpace(key);
        let id = normKey.substring(10, normKey.length - 5);
        const owner = cache.getValue(`playlists.${id}.owner`);
        a.push({
            id: id,
            name: states[key].val,
            your: application.userId === owner.val ? owner.val : ''
        });
    };
    return Promise.all(keys.map(fn))
        .then(() => {
            a.sort(function (l, u){
                return l['name'].toLowerCase().localeCompare(u['name'].toLowerCase());
            });
            let stateList = {};
            let listIds = '';
            let listString = '';
            let yourIds = '';
            let yourString = '';
            for (let i = 0; i < a.length; i++) {
                let normId = a[i].id;
                let normName = cleanState(a[i].name);
                if (listIds.length > 0) {
                    listIds += ';';
                    listString += ';';
                }
                stateList[normId] = normName;
                listIds += normId;
                listString += normName;
                if (a[i].your) {
                    if (yourIds.length > 0) {
                        yourIds += ';';
                        yourString += ';';
                    }
                    yourIds += normId;
                    yourString += normName;
                }
            }
            return Promise.all([
                cache.setValue('playlists.playlistListIds', listIds),
                cache.setValue('playlists.playlistListString', listString),
                cache.setValue('playlists.yourPlaylistListIds', yourIds),
                cache.setValue('playlists.yourPlaylistListString', yourString),
                setObjectStatesIfChanged('playlists.playlistList', stateList),
                adapter.log.debug('write playlists-List-Values in refreshPlaylistList()')
            ]);
        })
        .then(() => {
            let id = cache.getValue('player.playlist.id');
            if (id && id.val) {
                let owner = cache.getValue('player.playlist.owner');
                if (owner && owner.val) {
                    return cache.setValue('playlists.playlistList', shrinkStateName(owner.val + '-' + id.val));
                }
            }
        })
        .catch(err => adapter.log.warn('refreshPlaylistList err: ' + err));
}

function btnRefreshAlbumList() {
    return Promise.all([
        setObjectStatesIfChanged('albums.albumList', {}),
        cache.setValue('albums.albumListIds', ''),
        cache.setValue('albums.albumListString', ''),
        cache.setValue('albums.artistAlbumList', ''),
        cache.setValue('albums.artistList', '')
    ])
    .then(() => {
        refreshAlbumList();
        cache.setValue('refreshAlbumList', {val: false, ack: true});
    })
    .catch(err => adapter.log.warn('btnRefreshAlbumList err: ' + err));
}

function refreshAlbumList() {
    let a = [];
    let states = cache.getValue('albums.*');
    let keys = Object.keys(states);
    let fn = function (key) {
        if (!states[key] || !key.endsWith('.name')) {
            return;
        }
        let normKey = removeNameSpace(key);
        let id = normKey.substring(7, normKey.length - 5);
        let stateArtist = cache.getValue('albums.' + id + '.artistName');
        let artist = loadOrDefault(stateArtist, 'val', '');
        let tmpStates = (!isEmpty(artist)) ? artist + ' | ' + states[key].val : states[key].val;
        a.push({
            id: id,
            fullname: tmpStates,
            name: states[key].val,
            artist: artist
        });
    };

    return Promise.all(keys.map(fn))
        .then(() => {
            a.sort(function (l, u){
                return l['fullname'].toLowerCase().localeCompare(u['fullname'].toLowerCase());
            });
            let stateList = {};
            let listIds = '';
            let listString = '';
            let listArtist = '';
            let listFullname = '';
            for (let i = 0, len = a.length; i < len; i++) {
                let normId = a[i].id;
                let normName = cleanState(a[i].name);
                let normArtist = a[i].artist;
                let normFullname = cleanState(a[i].fullname);
                if (listIds.length > 0) {
                    listIds += ';';
                    listString += ';';
                    listArtist += ';';
                    listFullname += ';';
                }
                stateList[normId] = normFullname;
                listIds += normId;
                listString += normName;
                listArtist += normArtist;
                listFullname += normFullname;
            }
            return Promise.all([
                setObjectStatesIfChanged('albums.albumList', stateList),
                cache.setValue('albums.albumListIds', listIds),
                cache.setValue('albums.albumListString', listString),
                cache.setValue('albums.artistAlbumList', listFullname),
                cache.setValue('albums.artistList', listArtist)
            ]);
        })
        .then(() => {
            let idState = cache.getValue('player.album.id');
            if (idState) {
                let id = loadOrDefault(idState,'val', '');
                return cache.setValue('albums.albumList', id);    
            }
        })
        .catch(err => adapter.log.warn('refreshAlbumList err: ' + err));
}

function refreshDeviceList() {
    let a = [];
    let states = cache.getValue('devices.*');
    let keys = Object.keys(states);
    let fn = function (key) {
        if (!states[key] || !key.endsWith('.name')) {
            return;
        }
        let normKey = removeNameSpace(key);
        let id = normKey.substring(8, normKey.length - 5);
        const available = cache.getValue(`devices.${id}.isAvailable`);
        a.push({
            id: id,
            name: states[key].val,
            available: available ? available.val : false
        });
    };

    let activeDevice = false;
    return Promise.all(keys.map(fn))
        .then(() => {
            let stateList = {};
            let listIds = '';
            let listString = '';
            let availableIds = '';
            let availableString = '';
            for (let i = 0, len = a.length; i < len; i++) {
                let normId = a[i].id;
                let normName = cleanState(a[i].name);
                if (listIds.length > 0) {
                    listIds += ';';
                    listString += ';';
                }
                stateList[normId] = normName;
                listIds += normId;
                listString += normName;
                if (a[i].available) {
                    if (availableIds.length > 0) {
                        availableIds += ';';
                        availableString += ';';
                    }
                    availableIds += normId;
                    availableString += normName;
                }
            }

            return Promise.all([
                setObjectStatesIfChanged('devices.deviceList', stateList),
                cache.setValue('devices.deviceListIds', listIds),
                cache.setValue('devices.deviceListString', listString),
                cache.setValue('devices.availableDeviceListIds', availableIds),
                cache.setValue('devices.availableDeviceListString', availableString),
            ]);
        })
        .then(() =>  {
            let states = cache.getValue('devices.*');
            let keys = Object.keys(states);
            let fn = function (key) {
                if (!key.endsWith('.isActive')) {
                    return;
                }
                let val = states[key].val;
                if (val) {
                    key = removeNameSpace(key);
                    let id = key.substring(8, key.length - 9);
                    activeDevice = true;
                    return cache.setValue('devices.deviceList', id);
                }
            };
            return Promise.all(keys.map(fn));
        })
        .then(() => {
            if (!activeDevice) {
                return Promise.all([
                    /*cache.setValue('devices.deviceList', ''),
                    cache.setValue('player.device.id', ''),
                    cache.setValue('player.device.name', ''),
                    cache.setValue('player.device.type', ''),
                    cache.setValue('player.device.volume', 100),*/
                    cache.setValue('player.device.isActive', false) //,
                    /*cache.setValue('player.device.isAvailable', false),
                    cache.setValue('player.device.isRestricted', false),
                    cache.setValue('player.device', null, {
                        type: 'device',
                        common: {
                            name: 'Commands to control playback related to the current active device',
                            icon: getIconByType('')
                        },
                        native: {}
                    })*/
                ]);
            }
        })
        .then(() => listenOnHtmlDevices())
        .catch(err => adapter.log.warn('refreshDeviceList err: ' + err));
}

function generateRandomString(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function getToken() {
    let options = {
        url: 'https://accounts.spotify.com/api/token',
        method: 'POST',
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${application.clientId}:${application.clientSecret}`).toString('base64')
        },
        form: {
            grant_type: 'authorization_code',
            code: application.code,
            redirect_uri: application.redirect_uri
        }
    };

    let tokenObj;

    return request(options)
        .then(response => {
            let body = response.body;
            let parsedBody;
            try {
                parsedBody = JSON.parse(body);
            } catch (e) {
                parsedBody = {};
            }
            return saveToken(parsedBody);
        })
        .then(_tokenObj => {
            tokenObj = _tokenObj;
            return Promise.all([
                cache.setValue('authorization.authorizationUrl', ''),
                cache.setValue('authorization.authorizationReturnUri', ''),
                cache.setValue('authorization.authorized', true),
                cache.setValue('info.connection', true)
            ])
        })
        .then(() => {
            application.token = tokenObj.accessToken;
            application.refreshToken = tokenObj.refreshToken;
            return start();
        })
        .catch(err => adapter.log.debug(err));
}

function refreshToken() {
    adapter.log.debug('token is requested again');
    let options = {
        url: 'https://accounts.spotify.com/api/token',
        method: 'POST',
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${application.clientId}:${application.clientSecret}`).toString('base64')
        },
        form: {
            grant_type: 'refresh_token',
            refresh_token: application.refreshToken
        }
    };

    if (application.refreshToken !== '') {
        return request(options)
            .then(response => {
                // this request gets the new token
                if (response.statusCode === 200) {
                    let body = response.body;
                    adapter.log.debug('new token arrived');
                    adapter.log.debug(body);
                    let parsedJson;
                    try {
                        parsedJson = JSON.parse(body);
                    } catch (e) {
                        parsedJson = {};
                    }
                    if (!parsedJson.hasOwnProperty('refresh_token')) {
                        parsedJson.refresh_token = application.refreshToken;
                    }
                    adapter.log.debug(JSON.stringify(parsedJson))

                    return saveToken(parsedJson)
                        .then(tokenObj => application.token = tokenObj.accessToken)
                        .catch(err => {
                            adapter.log.debug(err);
                            return Promise.reject(err);
                        });
                } else {
                    return Promise.reject(response.statusCode);
                }
            });
    }
    isAuth = false;
    return Promise.reject('no refresh token');
}

function saveToken(data) {
    adapter.log.debug('saveToken');
    if ('undefined' !== typeof data.access_token && 'undefined' !== typeof data.refresh_token) {
        let token = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            clientId: application.clientId,
            clientSecret: application.clientSecret
        };
        return cache.setValue('authorization.token', token)
            .then(() => token);
    } else {
        adapter.log.error(JSON.stringify(data));
        return Promise.reject('no tokens found in server response');
    }
}

function increaseTime(durationMs, progressMs, startDate, count) {
    let now = Date.now();
    count--;
    progressMs += now - startDate;
    let tDurationMs = cache.getValue('player.durationMs').val;
    let percentage = Math.floor(progressMs / tDurationMs * 100);
    return Promise.all([
        cache.setValue('player.progress', convertToDigiClock(progressMs)),
        cache.setValue('player.progressMs', progressMs),
        cache.setValue('player.progressPercentage', percentage)
    ])
        .then(() => {
            if (count > 0) {
                if (progressMs + 1000 > durationMs) {
                    setTimeout(() => !stopped && pollStatusApi(), 1000);
                } else {
                    let state = cache.getValue('player.isPlaying');
                    if (state && state.val) {
                        scheduleStatusInternalTimer(durationMs, progressMs, now, count);
                    }
                }
            }
        });
}

function scheduleStatusInternalTimer(durationMs, progressMs, startDate, count) {
    clearTimeout(application.statusInternalTimer);
    application.statusInternalTimer = setTimeout(() => !stopped && increaseTime(durationMs, progressMs, startDate, count), 1000);
}

function pollRequestCount() {
    cache.setValue('requestCount',0);
    clearTimeout(application.requestPollingHandle);
    //ausgabe der werte
    return cache.setValue('requestCount',RequestCount)
    .then(() => {
        RequestCount = 0;
        scheduleRequestPolling();
    });
}

function scheduleRequestPolling() {
    clearTimeout(application.requestPollingHandle);
    application.requestPollingHandle = setTimeout(() => !stopped && pollRequestCount(), 60000);
}

function scheduleStatusPolling() {
    clearTimeout(application.statusPollingHandle);
    if (isPlaying) {
        //bei isPlaying Statusabfrage alle statusPlayPolling(10s) wenn nicht default = 0
        if (application.statusPlayPollingDelaySeconds > 0) {
            application.statusPollingHandle = setTimeout(() => !stopped && pollStatusApi(), application.statusPlayPollingDelaySeconds * 1000);
        }
    } else if (application.statusPollingDelaySeconds > 0) {
        application.statusPollingHandle = setTimeout(() => !stopped && pollStatusApi(), application.statusPollingDelaySeconds * 1000);
    }
}

function pollStatusApi(noReschedule) {
    if (!noReschedule) {
        clearTimeout(application.statusPollingHandle);
    }
    clearTimeout(application.statusInternalTimer);
    adapter.log.debug('call status polling');
    return sendRequest('/v1/me/player', 'GET', '')
        .then(data => {
            if (!isEmpty(data)) {
                createPlaybackInfo(data);
                cache.setValue('getPlaybackInfo', {val: false, ack: true});
            }
            // statusPolling auch starten wenn data is empty
            if (!noReschedule) {
                scheduleStatusPolling();
            }
        })
        .catch(err => {
            if (err !== 202) {
                application.error202shown = false;
            }
            //if (err === 202 || err === 401 || err === 502) {
            if (err === 202 || err === 401 || err === 408 || err === 500 || err === 502 || err === 503 || err === 504) {
                if (err === 202) {
                    if (!application.error202shown) {
                        adapter.log.debug(
                            'unexpected api response http 202; continue polling; nothing is wrong with the adapter; you will see a 202 response the first time a user connects to the spotify connect api or when the device is temporarily unavailable'
                        );
                    }
                    application.error202shown = true;
                } else {
                    if (err >= 500) {
                        //console.log('pollStatusApi: unexpected response http ' + err + '; continue polling');
                        adapter.log.debug('pollStatusApi: unexpected response http ' + err + '; continue polling');
                    } else {
                        adapter.log.warn('pollStatusApi: unexpected response http ' + err + '; continue polling');
                    }
                }
                // 202, 401 and 502 keep the polling running
                //let dummyBody = {
                //    is_playing: false
                //};
                // occurs when no player is open
                //createPlaybackInfo(dummyBody);
                if (!noReschedule) {
                    scheduleStatusPolling();
                }
            } else {
                // other errors stop the polling
                adapter.log.error('spotify status polling stopped with error ' + err);
            }
        });
}

function scheduleDevicePolling() {
    clearTimeout(application.devicePollingHandle);
    if (application.devicePollingDelaySeconds > 0) {
        application.devicePollingHandle = setTimeout(() => !stopped && pollDeviceApi(), application.devicePollingDelaySeconds *
            1000);
    }
}

function pollDeviceApi() {
    clearTimeout(application.devicePollingHandle);
    adapter.log.debug('call device polling');
    sendRequest('/v1/me/player/devices', 'GET', '')
        .then(data => {
            reloadDevices(data);
            scheduleDevicePolling();
        })
        .catch(err =>adapter.log.error('spotify device polling stopped with error ' + err));
}

function schedulePlaylistPolling() {
    clearTimeout(application.playlistPollingHandle);
    cache.setValue('pl_notFound', 0);
    cache.setValue('pl_found', 0);
    if (application.playlistPollingDelaySeconds > 0) {
        adapter.log.debug('call schedulePlaylistPolling');
        application.playlistPollingHandle = setTimeout(() => !stopped && pollPlaylistApi(), application.playlistPollingDelaySeconds *
            1000);
    }
}

function scheduleAlbumPolling() {
    clearTimeout(application.albumPollingHandle);
    if (application.albumPollingDelaySeconds > 0) {
        adapter.log.debug('call scheduleAlbumPolling');
        application.albumPollingHandle = setTimeout(() => !stopped && pollAlbumApi(), application.albumPollingDelaySeconds *
            1000);
    }
}

function scheduleShowPolling() {
    clearTimeout(application.showPollingHandle);
    if (application.showPollingDelaySeconds > 0) {
        adapter.log.debug('call scheduleShowPolling');
        application.showPollingHandle = setTimeout(() => !stopped && pollShowApi(), application.showPollingDelaySeconds *
            1000);
    }
}

/* default run all 15 min */
function pollPlaylistApi() {
    clearTimeout(application.playlistPollingHandle);
    adapter.log.debug('call playlist polling');
    loadPlaylistAppCache();
    pl_foundCount = 0;
    pl_notFoundCount = 0;
    reloadUsersPlaylist();
    getUsersCollection();
    schedulePlaylistPolling();
}

function pollShowApi() {
    clearTimeout(application.showPollingHandle);
    adapter.log.debug('call show polling');
    reloadUsersShows();
    scheduleShowPolling();
}

function pollAlbumApi() {
    clearTimeout(application.albumPollingHandle);
    adapter.log.debug('call album polling');
    doNotTestAlbum = false;
    reloadUsersAlbums();
    scheduleAlbumPolling();
}

function startShow(showId, episodeNo, keepTrack){
    if (isEmpty(showId)) {
        return Promise.reject('no showId on startShow');
    }
    if (isEmpty(episodeNo)) {
        episodeNo = 0;
    }
    lastPlayingShow.lastShowId = showId;
    lastPlayingShow.lastEpisodeNo = episodeNo;
    let episodeLst = '';
    let dur_msLst = cache.getValue('shows.' + showId + '.episodeDuration_msList');
    let episodeListState = cache.getValue('shows.' + showId + '.episodeListIds');
    if (episodeListState && episodeListState.val) {
        episodeLst = episodeListState.val.split(';');
    }
    if (episodeLst && episodeLst.length > 0) {
        lastPlayingShow.lastEpisodeId = episodeLst[episodeNo];  
        if (dur_msLst && dur_msLst.val) {
            let durLst = dur_msLst.val.split(';');
            if (durLst && durLst.length > 0) {
                lastPlayingShow.lastEpisodeDuration_ms = durLst[episodeNo];
            } else {
                lastPlayingShow.lastEpisodeDuration_ms = dur_msLst.val;
            }
        }
    }

    showStarted = true;
    if (keepTrack !== true) {
        keepTrack = false;
    }
    let resetShuffle = false;
    let r = Promise.resolve();

    if (application.keepShuffleState) {
        r = r
            .then(() => {
                let state = cache.getValue('player.shuffle');
                if (state && state.val) {
                    resetShuffle = true;
                    if (!keepTrack) {
                        const tracksTotal = cache.getValue(`shows.${shrinkStateName(showId)}.episodesTotal`);
                        if (tracksTotal && tracksTotal.val) {
                            episodeNo = Math.floor(Math.random() * Math.floor(tracksTotal.val));
                        }
                    }
                }
            });
    }
    return r
        .then(() => {
            let send = {
                context_uri: `spotify:show:${showId}`,
                offset: {
                    position: episodeNo
                }
            };
            let d_Id = getSelectedDevice(deviceData);
            return sendRequest('/v1/me/player/play?device_id=' + d_Id, 'PUT', JSON.stringify(send), true)
                .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000))
                .catch(err => adapter.log.error(`could not start show ${showId}; error: ${err}`));
        });
        /*.then(() => {
            if (application.keepShuffleState && resetShuffle) {
                if (adapter.config.defaultShuffle === 'off') {
                    return listenOnShuffleOff();
                } else {
                    return listenOnShuffleOn();
                }
            }
            if (adapter.config.defaultRepeat === 'context') {
                return listenOnRepeatContext();
            } else {
                return listenOnRepeatOff();
            }
        });*/
    }

function startPlaylist(playlist, owner, trackNo, keepTrack, startTrackId, position_ms) {
    //neu startTrackId: wenn nicht leer wird ab dieser TrackId die Playlist gestartet sonst mit trackNo
    //bei weiteren Problemen mit owner den owner aus playlists.xx.owner holen
    let playlist_owner = loadOrDefault(cache.getValue('player.playlist.owner'), 'val', '');
    if (isEmpty(owner) && !isEmpty(playlist_owner)) {
        owner = playlist_owner;
    } else if(isEmpty(owner) && isEmpty(playlist_owner)) {
        return Promise.reject('no owner, also on player.playlist.owner - please debug');
    }
    if (isEmpty(trackNo)) {
        return Promise.reject('no track no');
    }
    if (isEmpty(playlist)) {
        return Promise.reject('no playlist no');
    }
    if (keepTrack !== true) {
        keepTrack = false;
    }
    if (isEmpty(position_ms)) {
        position_ms = 0;
    }
    let resetShuffle = false;
    let r = Promise.resolve();

    if (application.keepShuffleState) {
        r = r
            .then(() => {
                let state = cache.getValue('player.shuffle');
                if (state && state.val) {
                    resetShuffle = true;
                    if (!keepTrack) {
                        const tracksTotal = cache.getValue(`playlists.${shrinkStateName(owner + '-' + playlist)}.tracksTotal`);
                        if (tracksTotal && tracksTotal.val) {
                            trackNo = Math.floor(Math.random() * Math.floor(tracksTotal.val));
                        }
                    }
                }
            });
    }

    return r
        .then(() => {
            let send = {};
            if (startTrackId && !isEmpty(startTrackId)) {
                send = {
                    context_uri: `spotify:user:${owner}:playlist:${playlist}`,
                    offset: {
                        uri: `spotify:track:${startTrackId}`,
                        position_ms: position_ms
                    }
                };
            } else {
                send = {
                    context_uri: `spotify:user:${owner}:playlist:${playlist}`,
                    offset: {
                        position: trackNo,
                        position_ms: position_ms
                    }
                };
            }
            let d_Id = getSelectedDevice(deviceData);
            return sendRequest('/v1/me/player/play?device_id=' + d_Id, 'PUT', JSON.stringify(send), true)
            //return sendRequest('/v1/me/player/play', 'PUT', JSON.stringify(send), true)
                .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000))
                .catch(err => adapter.log.error(`could not start playlist ${playlist} of user ${owner}; error: ${err}`));
        })
        .then(() => {
            if (application.keepShuffleState && resetShuffle) {
                if (adapter.config.defaultShuffle === 'off') {
                    return listenOnShuffleOff();
                } else {
                    return listenOnShuffleOn();
                }
            }
            //löst error 404 aus !!!
            /*if (adapter.config.defaultRepeat === 'context') {
                return listenOnRepeatContext();
            } else {
                return listenOnRepeatOff();
            }*/
        });
}

function startAlbum(albumId, trackNo, keepTrack) {
    if (isEmpty(trackNo)) {
        return Promise.reject('no track no');
    }
    if (isEmpty(albumId)) {
        return Promise.reject('no albumId no');
    }
    if (keepTrack !== true) {
        keepTrack = false;
    }
    let resetShuffle = false;
    let r = Promise.resolve();

    if (application.keepShuffleState) {
        r = r
            .then(() => {
                let state = cache.getValue('player.shuffle');
                if (state && state.val) {
                    resetShuffle = true;
                    if (!keepTrack) {
                        const tracksTotal = cache.getValue(`albums.${shrinkStateName(albumId)}.tracksTotal`);
                        if (tracksTotal && tracksTotal.val) {
                            trackNo = Math.floor(Math.random() * Math.floor(tracksTotal.val));
                        }
                    }
                }
            });
    }

    return r
        .then(() => {
            let send = {
                context_uri: `spotify:album:${albumId}`,
                offset: {
                    position: trackNo
                }
            };
            let d_Id = getSelectedDevice(deviceData);
            return sendRequest('/v1/me/player/play?device_id=' + d_Id, 'PUT', JSON.stringify(send), true)
                .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000))
                .catch(err => adapter.log.error(`could not start album ${albumId}; error: ${err}`));
        })
        .then(() => {
            if (application.keepShuffleState && resetShuffle) {
                if (adapter.config.defaultShuffle === 'off') {
                    return listenOnShuffleOff();
                } else {
                    return listenOnShuffleOn();
                }
            }
            //löst error 404 aus !!!
            /*if (adapter.config.defaultRepeat === 'context') {
                return listenOnRepeatContext();
            } else {
                return listenOnRepeatOff();
            }*/
        });
}

function startCollection(trackId, trackNo, keepTrack) {
    if (isEmpty(trackNo)) {
        return Promise.reject('no track no');
    }
    if (keepTrack !== true) {
        keepTrack = false;
    }
    let resetShuffle = false;
    let r = Promise.resolve();

    if (application.keepShuffleState) {
        r = r
            .then(() => {
                let state = cache.getValue('player.shuffle');
                if (state && state.val) {
                    resetShuffle = true;
                    if (!keepTrack) {
                        const tracksTotal = cache.getValue(`collections.myFavoriteCollection.tracksTotal`);
                        if (tracksTotal && tracksTotal.val) {
                            trackNo = Math.floor(Math.random() * Math.floor(tracksTotal.val));
                        }
                    }
                }
            });
    }

    return r
        .then(() => {
            let send = {
                context_uri: `spotify:user:${application.userId}:collection`,
                offset: {
                    position: trackNo
                }
            };
            let d_Id = getSelectedDevice(deviceData);
            return sendRequest('/v1/me/player/play?device_id=' + d_Id, 'PUT', JSON.stringify(send), true)
                .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000))
                .catch(err => adapter.log.error(`could not start collection trackId: ${trackId} and trackNo: ${trackNo} --> error: ${err}`));
        })
        .then(() => {
            if (application.keepShuffleState && resetShuffle) {
                if (adapter.config.defaultShuffle === 'off') {
                    return listenOnShuffleOff();
                } else {
                    return listenOnShuffleOn();
                }
            }
            //löst error 404 aus!!!
            /*if (adapter.config.defaultRepeat === 'context') {
                return listenOnRepeatContext();
            } else {
                return listenOnRepeatOff();
            }*/
        });
}


function listenOnAuthorizationReturnUri(obj) {
    let state = cache.getValue('authorization.state')
    let returnUri = querystring.parse(obj.state.val.slice(obj.state.val.search('[?]') + 1, obj.state.val.length));
    if ('undefined' !== typeof returnUri.state) {
        returnUri.state = returnUri.state.replace(/#_=_$/g, '');
    }
    if (state && returnUri.state === state.val) {
        adapter.log.debug('getToken');
        application.code = returnUri.code;
        return getToken();
    } else {
        adapter.log.error('invalid session. you need to open the actual authorization.authorizationUrl');
        return cache.setValue('Authorization.Authorization_Return_URI',
            'invalid session. You need to open the actual Authorization.Authorization_URL again');
    }
}

function listenOnGetAuthorization() {
    adapter.log.debug('requestAuthorization');
    let state = generateRandomString(20);
    let query = {
        client_id: application.clientId,
        response_type: 'code',
        redirect_uri: application.redirect_uri,
        state: state,
        scope: 'user-modify-playback-state user-read-playback-state user-read-playback-position user-read-currently-playing playlist-read-private user-library-read user-library-modify playlist-read-collaborative'
    };

    let options = {
        url: 'https://accounts.spotify.com/de/authorize/?' + querystring.stringify(query),
        method: 'GET',
        followAllRedirects: true,
    };

    return Promise.all([
        cache.setValue('authorization.state', state),
        cache.setValue('authorization.authorizationUrl', options.url),
        cache.setValue('authorization.authorized', false),
        cache.setValue('info.connection', false)
    ]);
}

function listenOnAuthorized(obj) {
    if (obj.state.val === true) {
        scheduleRequestPolling(); // 1x/min !
        scheduleStatusPolling();
        scheduleDevicePolling();
        let myAlTimeOut = null;
        let myPlTimeOut = null;
        let pl_poll = false;
        let alb_poll = false;
        
        if (!isAuth) {
            // first start of polling
            if (application.playlistPollingDelaySeconds > 0) {
                pl_poll = true;
                schedulePlaylistPolling();
            }
            if (application.albumPollingDelaySeconds > 0) {
                alb_poll = true;
                if (pl_poll) {
                    // wait for 5 min playlist-polling
                    myPlTimeOut = setTimeout(() => !stopped && scheduleAlbumPolling(), 300 * 1000);
                } else {
                    scheduleAlbumPolling();
                }
            }
            if (application.showPollingDelaySeconds > 0) {
                if (pl_poll || alb_poll) { 
                    if ((pl_poll && !alb_poll) || (!pl_poll && alb_poll)) {
                        // wait for 5 min playlist or album polling
                        myAlTimeOut = setTimeout(() => !stopped && scheduleShowPolling(), 300 * 1000);
                    } else if (pl_poll && alb_poll) {
                        // wait for 10 min playlist & album polling is active
                        myAlTimeOut = setTimeout(() => !stopped && scheduleShowPolling(), 600 * 1000);
                    }
                } else {
                    scheduleShowPolling();
                }
            }   
        } else {
            //wenn die polling Zeit > 1h (refresh Authorisation)
            if ('undefined' === typeof application.playlistPollingHandle) { // (application.playlistPollingHandle)
                schedulePlaylistPolling();
            }
            if ('undefined' === typeof application.albumPollingHandle) {
                scheduleAlbumPolling();
            }
            if ('undefined' === typeof application.showPollingHandle) {
                scheduleShowPolling();
            }
        }
        isAuth = true;
    }
}

function listenOnUseForPlayback(obj) {
    const lastDeviceId = cache.getValue(obj.id.slice(0, obj.id.lastIndexOf('.')) + '.id');
    if (!lastDeviceId) {
        return;
    }
    deviceData.lastSelectDeviceId = lastDeviceId.val;
    let send = {
        device_ids: [deviceData.lastSelectDeviceId],
        play: true
    };
    return sendRequest('/v1/me/player', 'PUT', JSON.stringify(send), true)
        .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000))
        .catch(err => adapter.log.error('listenOnUseForPlayback could not execute command: ' + err + ' device_id: ' + deviceData.lastSelectDeviceId));
}

function listenOnTrackList(obj) {
    if (obj.state.val >= 0) {
        let oSt = obj.id;
        //adapter.log.warn('obj.id String: ' + oSt);
        if (oSt.indexOf('album') >= 0) {
            listenOnPlayThisAlbum(obj, obj.state.val);
        } else if (oSt.indexOf('playlist') >= 0) {
            listenOnPlayThisList(obj, obj.state.val);
        } else if (oSt.indexOf('collection') >= 0){
            listenOnPlayThisCollection(obj, obj.state.val);
        }
    }
}

function listenOnTrackId(obj) {
    if (!isEmpty(obj.state.val)) {
        let oSt = obj.id;
        if (oSt.indexOf('playlist') >= 0) {
            listenOnPlayThisListTrackId(obj, obj.state.val)
        }
    }
}

function listenOnEpisodeList(obj) {
    if (obj.state.val >= 0) {
        let showid = cache.getValue(obj.id.slice(0, obj.id.lastIndexOf('.')) + '.id');
        
        if (showid && !isEmpty(showid.val)){
            let maxEpisodes =  0;
            let maxEpisodesState = cache.getValue('shows.' + showid.val + '.episodesTotal');
            if (maxEpisodesState && maxEpisodesState.val) {
                maxEpisodes = maxEpisodesState.val;
            }
            let eid = cache.getValue('shows.' + showid.val + '.episodeListIds');
            let eix = obj.state.val;
            let curEpiIx = 0;
            //nr gegenrechnen -> episodesTotal /spielt älteste episode zuerst!
            if (maxEpisodes > 1 && maxEpisodes > eix) {
                curEpiIx = maxEpisodes - (eix + 1);
            } else {
                curEpiIx = eix;
            }
            if (eid && eid.val && !isEmpty(eid.val)){
                let ixList = eid.val.split(';');
                let episodeId = ixList[eix];
                if (episodeId && !isEmpty(episodeId)){
                    adapter.log.debug('listenOnEpisodeList obj.slice... obj.state.val: ' + obj.state.val + ' episodeId: ' + episodeId);
                    lastPlayingShow.lastShowId = showid.val;
                    lastPlayingShow.lastEpisodeNo = obj.state.val;
                    lastPlayingShow.lastEpisodeId = episodeId;
                    let dur_msLst = cache.getValue('shows.' + showid.val + '.episodeDuration_msList');
                    if (dur_msLst && dur_msLst.val) {
                        let durLst = dur_msLst.val.split(';');
                        if (durLst.length > 0){
                            lastPlayingShow.lastEpisodeDuration_ms = durLst[eix];
                        } else {
                            lastPlayingShow.lastEpisodeDuration_ms = dur_msLst.val;
                        }
                        
                    }
                    listenOnEpisodeIdStr(episodeId);
                    // episode kann noch nicht direkt gestartet werden, play läuft immer vom alten zum neuen 99,98,97....
                    // curEpiIx = total(100) - (eix + 1) 0-basis
                    //startShow(showid.val, curEpiIx);
                }
            }
        }
    }
}

//Funktion zum Reaktivieren des letzten Device mit play
function transferPlayback(dev_id){
    if (!isEmpty(dev_id)){
        let  devIdAmazn = [dev_id]; //(dev_id.indexOf('_amzn_1') >= 0) ? dev_id.split('_amzn_1', 1) : [dev_id];
        // [] bei device_ids wegnehmen
        let send = {
            "device_ids": 
                devIdAmazn
            ,
            "play": true
        };
        adapter.log.debug('transferPlayback gestartet mit dev_id: ' + devIdAmazn);
        return sendRequest('/v1/me/player', 'PUT', JSON.stringify(send), true)
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000))
            .catch(err => adapter.log.error('transferPlayback could not execute command: ' + err + ' device_id: ' + devIdAmazn));  
    } else {
        adapter.log.debug('transferPlayback: dev_id is empty');
    }
}

function transferPlaybackNoPlay(){
    let dev_id = getSelectedDevice(deviceData);
    let send = {
        "device_ids": [dev_id],
        "play": false
    };
    adapter.log.debug('transferPlaybackNoPlay gestartet');
    return sendRequest('/v1/me/player', 'PUT', JSON.stringify(send), true)
        .then(() => setTimeout(() => !stopped && pollStatusApi(true), 1000))
        .catch(err => adapter.log.error('transferPlayback could not execute command: ' + err + ' device_id: ' + dev_id));  
}

function listenOnAddFavorite() {
    let playTrack = loadOrDefault(cache.getValue('player.trackId'), 'val', '');
    if (playTrack && !isEmpty(playTrack)) {
        return addTrackToCollection(playTrack);
    }
}

function listenOnDelFavorite() {
    let playTrack = loadOrDefault(cache.getValue('player.trackId'), 'val', '');
    if (playTrack && !isEmpty(playTrack)) {
        return deleteTrackInCollection(playTrack);
    }
}

function listenOnPlayThisList(obj, pos) {
    let keepTrack = true;
    if (isEmpty(pos)) {
        keepTrack = false;
        pos = 0;
    }
    // Play a specific playlist immediately
    const idState = cache.getValue(obj.id.slice(0, obj.id.lastIndexOf('.')) + '.id');
    const ownerState = cache.getValue(obj.id.slice(0, obj.id.lastIndexOf('.')) + '.owner');
    if (!idState || !ownerState) {
        return;
    }
    let id = idState.val;
    let owner = ownerState.val;
    return startPlaylist(id, owner, pos, keepTrack, '', 0);
}

function listenOnPlayThisListTrackId(obj, trackId) {
    let keepTrack = true;
    let pos = 0;

    // Play a specific playlist immediately
    const idState = cache.getValue(obj.id.slice(0, obj.id.lastIndexOf('.')) + '.id');
    const ownerState = cache.getValue(obj.id.slice(0, obj.id.lastIndexOf('.')) + '.owner');
    if (!idState || !ownerState) {
        return;
    }
    let id = idState.val;
    let owner = ownerState.val;
    return startPlaylist(id, owner, pos, keepTrack, trackId, 0);
}

function listenOnPlayThisCollection(obj, pos) {
    let keepTrack = true;
    if (isEmpty(pos)) {
        keepTrack = false;
        pos = 0;
    }
    const idState = cache.getValue(obj.id.slice(0, obj.id.lastIndexOf('.')) + '.id');
    if (!idState) {
        return;
    }
    let id = idState.val;
    return startCollection(id, pos, keepTrack);  
}

function listenOnPlayThisAlbum(obj, pos) {
    let keepTrack = true;
    if (isEmpty(pos)) {
        keepTrack = false;
        pos = 0;
    }
    // Play a specific playlist immediately
    const idState = cache.getValue(obj.id.slice(0, obj.id.lastIndexOf('.')) + '.id');
    if (!idState) {
        return;
    }
    let id = idState.val;
    return startAlbum(id, pos, keepTrack);
}

function listenOnPlayThisShow(obj, pos) {
    if (isEmpty(obj)) {
        return;
    }
    let keepTrack = true;
    if (isEmpty(pos)) {
        keepTrack = false;
        pos = 0;
    }
    // Play a specific show immediately
    // uri aus showListe laden bezieht sich auf show nicht episode
    const idState = cache.getValue(obj.id.slice(0, obj.id.lastIndexOf('.')) + '.id');
    if (!idState) {
        return;
    }
    let id = idState.val;
    //start show ...
    return startShow(id, pos, keepTrack);
}

function listenOnDeviceList(obj) {
    if (!isEmpty(obj.state.val)) {
        //listenOnUseForPlayback({id: `devices.${obj.state.val}.useForPlayback`});
        transferPlayback(obj.state.val);
    }
}

function listenOnPlaylistList(obj) {
    if (!isEmpty(obj.state.val)) {
        listenOnPlayThisList({id: `playlists.${obj.state.val}.playThisList`});
    }
}

function listenOnAlbumList(obj) {
    if (!isEmpty(obj.state.val)) {
        listenOnPlayThisAlbum({id: `albums.${obj.state.val}.playThisAlbum`});
    }
}

function listenOnShowList(obj) {
    if (!isEmpty(obj.state.val)) {
        listenOnPlayThisShow({id: `shows.${obj.state.val}.playThisShow`});
    }
}

function listenOnPlayUri(obj) {
    let query = {
        device_id: getSelectedDevice(deviceData)
    };

    let send = obj.state.val;
    if (!isEmpty(send['device_id'])) {
        query.device_id = send['device_id'];
        delete send['device_id'];
    }

    clearTimeout(application.statusPollingHandle);
    sendRequest('/v1/me/player/play?' + querystring.stringify(query), 'PUT', send, true)
        .catch(err => adapter.log.error('listenOnPlayUri could not execute command: ' + err))
        .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
}

function listenOnUriToQueue(obj) {
    if (obj && obj.state && obj.state.val && isPlaying) {
        let uri_tmp = obj.state.val;
        let uri = uri_tmp.replace(/:/g, '%3A');
        let dev_id = getSelectedDevice(deviceData);    

        clearTimeout(application.statusPollingHandle);
        adapter.log.debug('uri: ' + uri + ' dev_id: ' + dev_id);
        sendRequest('/v1/me/player/queue?uri=' + uri, 'POST', '', true) //geändert! nach uri eingefügen: + '&device_id=' + dev_id
            .catch(err => adapter.log.error('listenOnUriToQueue could not execute command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    } else {
        adapter.log.warn('listenOnUriToQueue: no uri or not playing');
    }
}

function listenOnUnfollowPlaylist(obj) {
    if (obj && obj.state && obj.state.val) {
        if (!isEmpty(obj.state.val)) {
            unfollowPlaylist(obj.state.val);
        }
    } else {
        adapter.log.warn('listenOnUnfollowPlaylist no playlistId');
    }
}

function listenOnUnfollowAlbum(obj) {
    if (obj && obj.state && obj.state.val) {
        if (!isEmpty(obj.state.val)) {
            unfollowAlbum(obj.state.val);
        }
    } else {
        adapter.log.warn('listenOnUnfollowAlbum no albumId');
    }
}

function listenOnUnfollowShow(obj) {
    if (obj && obj.state && obj.state.val) {
        if (!isEmpty(obj.state.val)) {
            unfollowShow(obj.state.val);
        }
    } else {
        adapter.log.warn('listenOnUnfollowShow no showId');
    }
}

function listenOnGetTrackInfo(obj) {
    if (obj && obj.state && obj.state.val) {
        if (!isEmpty(obj.state.val)) {
            let ret = getTrackInfo(obj.state.val);
            if (ret) {
                cache.setValue('getTrackInfoTrackId', {val: obj.state.val, ack: true});
            }
        }
    } else {
        adapter.log.warn('listenOnGetTrackInfo no trackId');
    }
}

function listenOnGetArtistInfo(obj) {
    if (obj && obj.state && obj.state.val) {
        if (!isEmpty(obj.state.val)) {
            //adapter.log.warn('getArtistInfo: ' + obj.state.val);
            let ret = getArtistInfo(obj.state.val);
            if (ret) {
                cache.setValue('getArtistInfoArtistId', {val: obj.state.val, ack: true});
            }
        }
    } else {
        adapter.log.warn('listenOnGetArtistInfo no artistId');
    }
}

function listenOnSetToFavorite(obj) {
    if (obj && obj.state && obj.state.val) {
        if (!isEmpty(obj.state.val)) {
            addTrackToCollection(obj.state.val);
            cache.setValue('setToFavorite', {val: obj.state.val, ack: true});
        }
    }
}

function listenOnUnsetFromFavorite(obj) {
    if (obj && obj.state && obj.state.val) {
        if (!isEmpty(obj.state.val)) {
            deleteTrackInCollection(obj.state.val);
            cache.setValue('unsetFromFavorite', {val: obj.state.val, ack: true});
        }
    }
}

function listenOnPlay() {
    let dev_isActive = cache.getValue('player.device.isActive');
    let dev_id = cache.getValue('player.device.id');

    //aktiviere letztes Device wenn vorhanden und starte play
    if (dev_id && dev_isActive && !dev_isActive.val && !isEmpty(dev_id.val)){
        let devs = cache.getValue('devices.availableDeviceListIds');
        if (devs && devs.val){
            let dev_lst = devs.val.split(';');
            if (dev_lst && dev_lst.length > 0 && dev_lst.indexOf(dev_id.val) > 0){
                transferPlayback(dev_id.val);
            } else {
                adapter.log.warn('listenOnPlay device: '+ dev_id.val + ' not available');
                return cache.setValue('player.device.isAvailable', false);
            }
        }
    } else {
        //normaler play wenn device.isActive
        let query = {
            device_id: getSelectedDevice(deviceData)
        };
        adapter.log.debug('lastSelect: ' + deviceData.lastSelectDeviceId + ' lastActive: ' + deviceData.lastActiveDeviceId);
        clearTimeout(application.statusPollingHandle);
        //sendRequest('/v1/me/player/play?' + querystring.stringify(query), 'PUT', '', true)
        sendRequest('/v1/me/player/play', 'PUT', '', true)
            .catch(err => adapter.log.error('listenOnPlay could not execute command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    }
    adapter.log.debug('play device_id: ' + getSelectedDevice(deviceData));
}

function listenOnPause() {
    let query = {
        device_id: getSelectedDevice(deviceData)
    };
    adapter.log.debug('pause device_id: ' + getSelectedDevice(deviceData));
    adapter.log.debug('lastSelect: ' + deviceData.lastSelectDeviceId + ' lastActive: ' + deviceData.lastActiveDeviceId);
    clearTimeout(application.statusPollingHandle);
    //sendRequest('/v1/me/player/pause?' + querystring.stringify(query), 'PUT', '', true)
    sendRequest('/v1/me/player/pause', 'PUT', '', true)
        .catch(err => adapter.log.error('listenOnPause could not execute command: ' + err))
        .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
}

function listenOnSkipPlus() {
    if (isPlaying) {
        let query = {
            device_id: getSelectedDevice(deviceData)
        };
        clearTimeout(application.statusPollingHandle);
        //sendRequest('/v1/me/player/next?' + querystring.stringify(query), 'POST', '', true)
        sendRequest('/v1/me/player/next', 'POST', '', true)
            .catch(err => adapter.log.error('listenOnSkipPlus could not execute command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    }
}

function listenOnSkipMinus() {
    if (isPlaying) {
        let query = {
            device_id: getSelectedDevice(deviceData)
        };
        clearTimeout(application.statusPollingHandle);
        //sendRequest('/v1/me/player/previous?' + querystring.stringify(query), 'POST', '', true)
        sendRequest('/v1/me/player/previous', 'POST', '', true)
            .catch(err => adapter.log.error('listenOnSkipMinus could not execute command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    }
}

function listenOnRepeat(obj) {
    if (isPlaying) {
        if (['track', 'context', 'off'].indexOf(obj.state.val) >= 0) {
            clearTimeout(application.statusPollingHandle);
            sendRequest('/v1/me/player/repeat?state=' + obj.state.val, 'PUT', '', true)
                .catch(err => adapter.log.error('listenOnRepeat could not execute command: ' + err))
                .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
        }
    }
}

function listenOnRepeatTrack() {
    listenOnRepeat({
        state: {
            val: 'track'
        }
    });
}

function listenOnRepeatContext() {
    listenOnRepeat({
        state: {
            val: 'context'
        }
    });
}

function listenOnRepeatOff() {
    listenOnRepeat({
        state: {
            val: 'off'
        }
    });
}

function listenOnVolume(obj) {
    let d_Id = getSelectedDevice(deviceData);
    if (isPlaying) {
        clearTimeout(application.statusPollingHandle);
        //sendRequest('/v1/me/player/volume?volume_percent=' + obj.state.val + '&device_id=' + d_Id, 'PUT', '', true)
        sendRequest('/v1/me/player/volume?volume_percent=' + obj.state.val, 'PUT', '', true)
            .catch(err => adapter.log.error('could not execute volume-command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    }
}

function listenOnProgressMs(obj) {
    let progress = obj.state.val;
    let duration = 0;
    clearTimeout(application.statusInternalTimer);

    sendRequest('/v1/me/player/seek?position_ms=' + progress, 'PUT', '', true)
    .then(function () {
        const durationState = cache.getValue('player.durationMs');
        if (durationState) {
            duration = durationState.val;

            if (duration > 0 && duration <= progress) {
                let progressPercentage = Math.floor(progress / duration * 100);
                return Promise.all([
                    cache.setValue('player.progressMs', progress),
                    cache.setValue('player.progress', convertToDigiClock(progress)),
                    cache.setValue('player.progressPercentage', progressPercentage)
                ]);
            }
        }
    })
        .catch(err => adapter.log.error('could not execute command: ' + err))
        .then(() => setTimeout(() => !stopped && scheduleStatusInternalTimer(duration, progress, Date.now(), application.statusPlayPollingDelaySeconds - 1), 1000));
}

function listenOnProgressPercentage(obj) {
    let progressPercentage = obj.state.val;
    if (progressPercentage < 0 || progressPercentage > 100) {
        return;
    }
    clearTimeout(application.statusInternalTimer);
    const durationState = cache.getValue('player.durationMs');
    if (durationState) {
        let duration = durationState.val;
        if (duration > 0) {
            let progress = Math.floor(progressPercentage / 100 * duration);
            sendRequest('/v1/me/player/seek?position_ms=' + progress, 'PUT', '', true)
                .then(() => Promise.all([
                    cache.setValue('player.progressMs', progress),
                    cache.setValue('player.progress', convertToDigiClock(progress)),
                    cache.setValue('player.progressPercentage', progressPercentage)
                ]))
                .catch(err => adapter.log.error('could not execute command: ' + err))
                .then(() => setTimeout(() => !stopped && scheduleStatusInternalTimer(duration, progress, Date.now(), application.statusPlayPollingDelaySeconds - 1), 1000));
        }
    }
}

function listenOnShuffle(obj) {
    if (isPlaying) {
        clearTimeout(application.statusPollingHandle);
        return sendRequest('/v1/me/player/shuffle?state=' + (obj.state.val === 'on' ? 'true' : 'false'), 'PUT', '', true)
            .catch(err => adapter.log.error('could not execute command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    }
}

function listenOnShuffleOff() {
    return listenOnShuffle({
        state: {
            val: 'off',
            ack: false
        }
    });
}

function listenOnShuffleOn() {
    return listenOnShuffle({
        state: {
            val: 'on',
            ack: false
        }
    });
}

function listenOnTrackId(obj) {
    let send = {
        uris: ['spotify:track:' + obj.state.val],
        offset: {
            position: 0
        }
    };
    clearTimeout(application.statusPollingHandle);
    sendRequest('/v1/me/player/play', 'PUT', JSON.stringify(send), true)
        .catch(err => adapter.log.error('listenOnTrackId could not execute command: ' + err))
        .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
}

function listenOnShowId(obj) {
    if (obj && obj.state && obj.state.val) {
        let d_Id = getSelectedDevice(deviceData);
        let send = {
            context_uri: ['spotify:show:' + obj.state.val]
        };
        clearTimeout(application.statusPollingHandle);
        sendRequest('/v1/me/player/play?device_id=' + d_Id, 'PUT', JSON.stringify(send), true)
            .catch(err => adapter.log.error('listenOnShowId could not execute command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    }
}

function listenOnEpisodeId(obj) {
    if (obj && obj.state && obj.state.val) {
        let d_Id = getSelectedDevice(deviceData);
        let send = {
            uris: ['spotify:episode:' + obj.state.val]
        };
        clearTimeout(application.statusPollingHandle);
        //sendRequest('/v1/me/player/play?device_id=' + d_Id, 'PUT', JSON.stringify(send), true)
        sendRequest('/v1/me/player/play', 'PUT', JSON.stringify(send), true)
            .catch(err => adapter.log.error('listenOnEpisodeId could not execute command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    }
}

function listenOnEpisodeIdStr(episodeIdStr) {
    if (!isEmpty(episodeIdStr)) {
        let d_Id = getSelectedDevice(deviceData);
        let send = {
            uris: ['spotify:episode:' + episodeIdStr]
        };
        clearTimeout(application.statusPollingHandle);
        //sendRequest('/v1/me/player/play?device_id=' + d_Id, 'PUT', JSON.stringify(send), true)
        sendRequest('/v1/me/player/play', 'PUT', JSON.stringify(send), true)
            .catch(err => adapter.log.error('listenOnEpisodeStrId could not execute command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    }
}

function listenOnPlaylistId(obj) {
    const ownerState = cache.getValue('player.playlist.owner');
    if (!ownerState) {
        return;
    }
    return startPlaylist(obj.state.val, ownerState.val, 0, true, '', 0);
}

function listenOnAlbumId(obj) {
    return startAlbum(obj.state.val, 0);
}

function listenOnPlaylistOwner(obj) {
    const PlayListIdState = cache.getValue('player.playlist.id');
    if (!PlayListIdState) {
        return;
    }
    return startPlaylist(PlayListIdState.val, obj.state.val, 0, true, '', 0);
}

function listenOnPlaylistTrackNo(obj) {
    const PlayListIdState = cache.getValue('player.playlist.id');
    const ownerState = cache.getValue('player.playlist.owner');
    if (!PlayListIdState || !ownerState) {
        return;
    }
    let owner = ownerState.val;
    let id = PlayListIdState.val;
    let o = obj.state.val;
    o = parseInt(o, 10) || 1;

    return startPlaylist(id, owner, o - 1, true, '', 0);
}

function listenOnAlbumTrackNo(obj) {
    const AlbumIdState = cache.getValue('player.album.id');
    if (!AlbumIdState) {
        return;
    }
    let id = AlbumIdState.val;
    let o = obj.state.val;
    o = parseInt(o, 10) || 1;

    return startAlbum(id, o - 1, true);
}

function listenOnShowTrackNo(obj) {
    const showIdState = cache.getValue('player.show.id');
    if (!showIdState) {
        return;
    }
    let maxEpiState = cache.getValue('player.show.episodesTotal');
    let maxEpi = 0;
    if (maxEpiState && maxEpiState.val) {
        maxEpi = maxEpiState.val;
    }
    let id = showIdState.val;
    let o = obj.state.val;
    o = parseInt(o, 10) || 1;
    let nr = 0;
    if (maxEpi > 1 && o > 0) {
        nr = maxEpi - o;
    } else {
        nr = o - 1;
    }
    return startShow(id, nr, true);
}

function listenOnGetPlaybackInfo() {
    return pollStatusApi(false);
}

function listenOnGetDevices() {
    return sendRequest('/v1/me/player/devices', 'GET', '')
        .then(data => reloadDevices(data));
}

function clearCache() {
    artistImageUrlCache = {};
    playlistInfoCache = {};
    playlistAppCache = [];
    albumCache = {};
    application.cacheClearHandle = setTimeout(() => !stopped && clearCache(), 1000 * 60 * 60 * 24);
}

function btnClearCache() {
    artistImageUrlCache = {};
    playlistInfoCache = {};
    playlistAppCache = [];
    albumCache = {};
    cache.reloadCache();
    cache.setValue('clearCache', {val: false, ack: true});
}

function listenOnHtmlPlaylists() {
    let obj = cache.getValue('playlists.playlistList');
    let current;
    if (obj === null || !obj.val) {
        current = '';
    } else {
        current = obj.val;
    }
    obj = cache.getValue('playlists.playlistListIds');
    if (obj === null || !obj.val) {
        return cache.setValue('html.playlists', '');
    }
    let ids = obj.val.split(';');
    obj = cache.getValue('playlists.playlistListString');
    if (obj === null || !obj.val) {
        return cache.setValue('html.playlists', '');
    }
    let strings = obj.val.split(';');
    let html = '<table class="spotifyPlaylistsTable">';

    for (let i = 0; i < ids.length; i++) {
        let style = '';
        let cssClassRow = '';
        let cssClassTitle = '';
        let cssClassIcon = '';
        if (current === ids[i]) {
            style = ' style="color: #1db954; font-weight: bold"';
            cssClassRow = ' spotifyPlaylistsRowActive';
            cssClassTitle = ' spotifyPlaylistsColTitleActive';
            cssClassIcon = ' spotifyPlaylistsColIconActive';
        }
        html += `<tr class="spotifyPlaylistsRow${cssClassRow}" onclick="vis.setValue('${adapter.namespace}.playlists.playlistList', '${ids[i]}')">`;
        html += '<td' + style + ' class="spotifyPlaylistsCol spotifyPlaylistsColTitle' + cssClassTitle + '">';
        html += strings[i];
        html += '</td>';
        html += '<td class="spotifyPlaylistsCol spotifyPlaylistsColIcon' + cssClassIcon + '">';
        if (current === ids[i]) {
            html += '<img style="width: 16px; height: 16px" class="spotifyPlaylistsColIconActive" src="widgets/spotify-premium/img/active_song_speaker_green.png" alt="cover" />';
        }
        html += '</td>';
        html += '</tr>';
    }

    html += '</table>';

    return cache.setValue('html.playlists', html);
}

function listenOnHtmlTracklist() {
    let obj = cache.getValue('player.playlist.trackList');
    let current;
    if (obj === null || !obj.val) {
        current = '';
    } else {
        current = obj.val;
    }

    obj = cache.getValue('player.playlist.trackListArray');
    if (obj === null || !obj.val) {
        return cache.setValue('html.tracks', '');
    }
    if (typeof obj.val === 'string') {
        try {
            obj.val = JSON.parse(obj.val);
        } catch (e) {
            obj.val = [];
        }
    }

    let source = obj.val;
    let html = '<table class="spotifyTracksTable">';

    for (let i = 0; i < source.length; i++) {
        let styleTitle = '';
        let styleDuration = '';
        let cssClassRow = '';
        let cssClassColTitle = '';
        let cssClassTitle = '';
        let cssClassIcon = '';
        let cssClassArtistAlbum = '';
        let cssClassArtist = '';
        let cssClassAlbum = '';
        let cssClassExplicit = '';
        let cssClassColDuration = '';
        let cssClassSpace = '';
        let cssClassLinebreak = '';
        if (current == i) {
            styleTitle = ' style="color: #1db954; font-weight: bold"';
            styleDuration = ' style="color: #1db954"';
            cssClassRow = ' spotifyTracksRowActive';
            cssClassColTitle = ' spotifyTracksColTitleActive';
            cssClassTitle = ' spotifyTracksTitleActive';
            cssClassIcon = ' spotifyTracksColIconActive';
            cssClassArtistAlbum = ' spotifyTracksArtistAlbumActive';
            cssClassArtist = ' spotifyTracksArtistActive';
            cssClassAlbum = ' spotifyTracksAlbumActive';
            cssClassExplicit = ' spotifyTracksExplicitActive';
            cssClassColDuration = ' spotifyTracksColDurationActive';
            cssClassSpace = ' spotifyTracksSpaceActive';
            cssClassLinebreak = ' spotifyTracksLinebreakActive';
        }

        html += `<tr class="spotifyTracksRow${cssClassRow}" onclick="vis.setValue('${adapter.namespace}.player.playlist.trackList', ${i})">`;
        html += `<td class="spotifyTracksColIcon${cssClassIcon}">`;
        if (current == i) {
            html += '<img style="width: 16px; height: 16px" class="spotifyTracksIconActive" src="widgets/spotify-premium/img/active_song_speaker_green.png" />';
        } else {
            html += '<img style="width: 16px; height: 16px" class="spotifyTracksIconInactive" src="widgets/spotify-premium/img/inactive_song_note_white.png" />';
        }
        html += '</td>';
        html += `<td${styleTitle} class="spotifyTracksColTitle${cssClassColTitle}">`;
        html += `<span class="spotifyTracksTitle${cssClassTitle}">`;
        html += source[i].title;
        html += '</span>';
        html += `<span class="spotifyTracksLinebreak${cssClassLinebreak}"><br /></span>`;
        html += `<span class="spotifyTracksArtistAlbum${cssClassArtistAlbum}">`;
        if (source[i].explicit) {
            html += `<img style="width: auto; height: 16px" class="spotifyTracksExplicit${cssClassExplicit}" src="widgets/spotify-premium/img/explicit.png" />`;
        }
        html += `<span class="spotifyTracksArtist${cssClassArtist}">`;
        html += source[i].artistName;
        html += '</span>';
        html += `<span class="spotifyTracksSpace${cssClassSpace}">&nbsp;&bull;&nbsp;</span>`;
        html += `<span class="spotifyTracksAlbum${cssClassAlbum}">`;
        html += source[i].album ? source[i].album.name || '--' : '--';
        html += '</span></span></td>';
        html += `<td${styleDuration} class="spotifyTracksColDuration${cssClassColDuration}">`;
        html += source[i].duration;
        html += '</td>';
        html += '</tr>';
    }

    html += '</table>';

    return cache.setValue('html.tracks', html);
}

function listenOnHtmlDevices() {
    let obj = cache.getValue('devices.deviceList');
    let current;
    if (obj === null || !obj.val) {
        current = '';
    } else {
        current = obj.val
    }
    obj = cache.getValue('devices.deviceListIds');
    if (obj === null || !obj.val) {
        return cache.setValue('html.devices', '');
    }
    let ids = obj.val.split(';');
    obj = cache.getValue('devices.availableDeviceListString');
    if (obj === null || !obj.val) {
        return cache.setValue('html.devices', '');
    }
    let strings = obj.val.split(';');
    let html = '<table class="spotifyDevicesTable">';

    for (let i = 0; i < ids.length; i++) {
        const typeState = cache.getValue('devices.' + ids[i] + '.type');
        if (!typeState) {
            continue;
        }
        let type = getIconByType(typeState.val);

        let style = '';
        let cssClassRow = '';
        let cssClassColName = '';
        let cssClassColIcon = '';
        if (current === ids[i]) {
            style = ' style="color: #1db954; font-weight: bold"';
            cssClassRow = ' spotifyDevicesRowActive';
            cssClassColName = ' spotifyDevicesColNameActive';
            cssClassColIcon = ' spotifyDevicesColIconActive';
        }
        html += `<tr class="spotifyDevicesRow${cssClassRow}" onclick="vis.setValue('${adapter.namespace}.devices.deviceList', '${ids[i]}')">`;
        html += `<td${style} class="spotifyDevicesColIcon${cssClassColIcon}">`;
        if (current === ids[i]) {
            html += `<img style="width: 16px; height: 16px" class="spotifyDevicesIconActive" src="widgets/spotify-premium/img/${type.replace('black', 'green').replace('icons/', '')}" />`;
        } else {
            html += `<img style="width: 16px; height: 16px" class="spotifyDevicesIcon" src="widgets/spotify-premium/img/${type.replace('icons/', '')}" />`;
        }
        html += '</td>';
        html += `<td${style} class="spotifyDevicesColName${cssClassColName}">`;
        html += strings[i];
        html += '</td>';
        html += '</tr>';
    }

    html += '</table>';

    cache.setValue('html.devices', html);
}

//If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
