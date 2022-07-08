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
let playlistCache = [{ //TODO Abfrage der Playlist-Daten über cache
    plc_Id: '',
    plc_owner: '',
    plc_name: '',
    plc_description: '',
    plc_snapshotId: '',
    plc_type: '',
    plc_uri: '',
    plc_image0url: '',
    plc_collaborative: false,
    plc_public: false,
    plc_tracksTotal: 0,
    plc_refreshTime: 0
}];
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
    statusInternalTimer: null,
    requestPollingHandle: null,
    statusPollingHandle: null,
    statusPollingDelaySeconds: 5,
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
let pl_foundCount = 0;
let pl_notFoundCount = 0;
let isAuth = false;
let trackIsFav = false;
let lastTrackId = '';

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
            cache.on(/\.useForPlayback$/, listenOnUseForPlayback);
            cache.on(/\.trackList$/, listenOnTrackList, true);
            cache.on(/\.playThisShow$/, listenOnPlayThisShow);
            cache.on(/\.playThisList$/, listenOnPlayThisList);
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
            cache.on('getAlbums', reloadUsersAlbums);
            cache.on('getPlaylists', reloadUsersPlaylist);
            cache.on('getCollection', getUsersCollection);
            cache.on('checkTrackInCollection', checkForTrackInCollection);
            cache.on('getCurrentPlaylist', getCurrentPlaylist); //get currently playing playlist
            cache.on('getPlaybackInfo', listenOnGetPlaybackInfo);
            cache.on('getDevices', listenOnGetDevices);
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
    if (isEmpty(application.statusPollingDelaySeconds)) {
        application.statusPollingDelaySeconds = 5;
    } else if (application.statusPollingDelaySeconds < 1 && application.statusPollingDelaySeconds) {
        application.statusPollingDelaySeconds = 0;
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
    /*if (deviceInterval < 1 && deviceInterval) {
        deviceInterval = 1;
    }
    if (playlistInterval < 1 && playlistInterval) {
        playlistInterval = 1;
    }
    if (albumInterval < 1 && albumInterval) {
        albumInterval = 1;
    }
    if (showInterval < 1 && showInterval) {
        showInterval = 1;
    }*/
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
        adapter.log.debug("bei copyState: fehlerhafte Playlists-Daten src");
        return;
    }
}

function copyObjectStates(src, dst) {
    //return setObjectStatesIfChanged(dst, cache.getObj(src).common.states);
    let tmp_src = cache.getObj(src);
    if (tmp_src && tmp_src.common) {
        return setObjectStatesIfChanged(dst, tmp_src.common.states);
    } else {
        adapter.log.debug("bei copyObjectStates: fehlerhafte Playlists-Daten src");
        return;
    }
}

function createShowInfo(data){
    if (isEmpty(data)) {
        data = {};
    }
    /*
    let deviceId = loadOrDefault(data, 'device.id', '');
    let isDeviceActive = loadOrDefault(data, 'device.is_active', false);
    let isDeviceRestricted = loadOrDefault(data, 'device.is_restricted', false);
    let deviceName = loadOrDefault(data, 'device.name', '');
    let deviceType = loadOrDefault(data, 'device.type', '');
    let deviceVolume = loadOrDefault(data, 'device.volume_percent', 100);
    let isPlaying = loadOrDefault(data, 'is_playing', false);
    let shuffle = loadOrDefault(data, 'shuffle_state', false);
    let type = loadOrDefault(data, 'currently_playing_type', '');
    let showId = lastPlayingShow.lastShowId;
    let epiName = cache.getValue('shows.' + showId + '.episodeListString');
    let episodeName = '';
    if (epiName && epiName.val){
        let epiLst = epiName.val.split(';');
        if (epiLst && epiLst.length > 0 && lastPlayingShow.lastEpisodeNo <= epiLst.length){
            episodeName = epiLst[lastPlayingShow.lastEpisodeNo];
        }
    }
    let duration = 0;
    //abfrage nach duration
    if (isPlaying) {
        showStarted = true;
    } else {
        showStarted = false;
    }
    if (showStarted) {
        //duration = cache.getValue('player.durationMs').val;
        duration = lastPlayingShow.lastEpisodeDuration_ms;
    }
    let progress = loadOrDefault(data, 'progress_ms', 0);
    let progressPercentage = 0;
    if (duration > 0) {
        progressPercentage = Math.floor(progress / duration * 100);
    }

    //Werte speichern
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
        }),
        cache.setValue('player.isPlaying', isPlaying),
        //setOrDefault(data, 'item.id', 'player.episodeId', ''),
        //setOrDefault(data, 'item.name', 'player.episodeName', ''),
        cache.setValue('player.episodeId', lastPlayingShow.lastEpisodeId),
        cache.setValue('player.episodeName', episodeName),
        cache.setValue('player.durationMs', duration),
        cache.setValue('player.duration', convertToDigiClock(duration)),
        cache.setValue('player.type', type),
        cache.setValue('player.progressMs', progress),
        cache.setValue('player.progressPercentage', progressPercentage),
        cache.setValue('player.progress', convertToDigiClock(progress)),
        cache.setValue('player.shuffle', (shuffle ? 'on' : 'off')),
        setOrDefault(data, 'repeat_state', 'player.repeat', adapter.config.defaultRepeat),
        setOrDefault(data, 'device.volume_percent', 'player.device.volume', 100),
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
        if (progress && isPlaying && application.statusPollingDelaySeconds > 0) {
            scheduleStatusInternalTimer(duration, progress, Date.now(), application.statusPollingDelaySeconds - 1);
        }
    })
    .then(() => {
        const promises = [
            copyState(`shows.${showId}.episodeListNumber`, 'player.show.episodeListNumber'),
            copyState(`shows.${showId}.episodeListString`, 'player.show.episodeListString'),
            copyState(`shows.${showId}.episodeListStates`, 'player.show.episodeListStates'),
            copyObjectStates(`shows.${showId}.episodeList`, 'player.show.episodeList'),
            copyState(`shows.${showId}.episodeListIdMap`, 'player.show.episodeListIdMap'),
            copyState(`shows.${showId}.episodeListIds`, 'player.show.episodeListIds'),
            copyState(`shows.${showId}.episodeListArray`, 'player.show.episodeListArray')
        ];
        return Promise.all(promises);
    })
    .then(() => {
        return Promise.all([
            cache.setValue('player.playlist.id', ''),
            cache.setValue('player.playlist.name', ''),
            cache.setValue('player.playlist.owner', ''),
            cache.setValue('player.playlist.tracksTotal', 0),
            cache.setValue('player.playlist.snapshot_id', ''),
            cache.setValue('player.playlist.imageUrl', ''),
            cache.setValue('player.playlist.trackList', ''),
            cache.setValue('player.playlist.trackListNumber', ''),
            cache.setValue('player.playlist.trackListString', ''),
            cache.setValue('player.playlist.trackListStates', ''),
            cache.setValue('player.playlist.trackListIdMap', ''),
            cache.setValue('player.playlist.trackListIds', ''),
            cache.setValue('player.playlist.trackListArray', ''),
            cache.setValue('player.playlist.trackNo', 0),
            cache.setValue('playlists.playlistList', ''),
            cache.setValue('player.playlist', null, {
                type: 'channel',
                common: {
                    name: 'Commands to control playback related to the playlist'
                },
                native: {}
            })
        ])
    }) */
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
    let isPlaying = loadOrDefault(data, 'is_playing', false);
    let duration = loadOrDefault(data, 'item.duration_ms', 0);
    let type = '';
    let ctype = loadOrDefault(data, 'context.type', '');
    let itype = loadOrDefault(data, 'item.type', '');
    let popularity = loadOrDefault(data, 'item.popularity', 0);
    let currently_playing_type = loadOrDefault(data, 'currently_playing_type', '');
    if (!isPlaying) {
        showStarted = false;
    }
    if (!isEmpty(ctype)){
        type = ctype;
    } else if (isEmpty(ctype) && !isEmpty(itype)) {
        type = itype;
    } else if (isEmpty(itype) && !isEmpty(currently_playing_type)) {
        type = currently_playing_type;
    }
    if (isEmpty(type) && !isEmpty(currentPlayingType)) {
        type = currentPlayingType;
    } else {
        currentPlayingType = type;
    }
    //adapter.log.warn('playbackInfo type: ' + type);
    let progress = loadOrDefault(data, 'progress_ms', 0);
    let progressPercentage = 0;

    let contextDescription = '';
    let contextImage = '';
    let album = loadOrDefault(data, 'item.album.name', '');
    let albumId = loadOrDefault(data, 'item.album.id', '');
    let albumUrl = loadOrDefault(data, 'item.album.images[0].url', '');
    let artist = getArtistNamesOrDefault(data, 'item.artists');
    let albumArtistName = loadOrDefault(data, 'item.album.artists[0].name','');
    let showId = '';
    let episodeId = '';
    let episodeNo = ''; 
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
    } else if ( type === 'episode') {
        //episode has no images
        let stateImg = cache.getValue('player.show.imageUrl');      
        contextImage = loadOrDefault(stateImg, 'val', '');
        if (showStarted) {
            showId = lastPlayingShow.lastShowId;
            episodeId = lastPlayingShow.lastEpisodeId;
            episodeNo = lastPlayingShow.lastEpisodeNo;
            duration = lastPlayingShow.lastEpisodeDuration_ms;
        }
    }
    if (duration > 0) {
        progressPercentage = Math.floor(progress / duration * 100);
    }
    let shuffle = loadOrDefault(data, 'shuffle_state', false);
    let trackId = loadOrDefault(data, 'item.id', '');
    //Abfrage ob player isPlaying
    if (isPlaying) {
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
                if (progress && isPlaying && application.statusPollingDelaySeconds > 0) {
                    scheduleStatusInternalTimer(duration, progress, Date.now(), application.statusPollingDelaySeconds - 1);
                }
            })
            .then(() => {
                //abfrage nach type ergänzt episode separat (anderer Datenstruktur)
                if (type === 'track' || type === 'playlist' || type === 'album' || type === 'artist' || type === 'collection') {
                    //prüfe trackInFavorite (1x abfragen/trackid-wechsel ! err 429 !)
                    if (!isEmpty(trackId) && (lastTrackId === '' || lastTrackId !== trackId)) {
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
                            return sendRequest('/v1/artists/' + artist,
                                'GET', '')
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
                            //cache.setValue('player.album', album),
                            cache.setValue('player.albumImageUrl', albumUrl),
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
                        ])
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
                                if (indexOfUser < 0){
                                    let idLst = loadOrDefault(cache.getValue('playlists.playlistListIds'), 'val', '').split(';');
                                    for (let i = 0; i < idLst.length; i++){
                                        let _idOwner = idLst[i].split('-');
                                        if (_idOwner[1] === playlistId) {
                                            ownerId = _idOwner[0];
                                            break;
                                        } 
                                    }
                                    //adapter.log.warn('ermittelt ownerId: ' + ownerId);
                                }
                                //adapter.log.warn('getPlaylistCacheItem erreicht owner: ' + ownerId + ' plId: '+ playlistId);
                                let pl_ix = getPlaylistCacheItem(ownerId, playlistId);
                                let plCacheItem = playlistAppCache[pl_ix];
                                let Pl_ListId = loadOrDefault(cache.getValue('playlists.playlistListIds'), 'val', '');
                                //adapter.log.warn('playlistItemCache.len: ' + plCacheItem);
                                if (plCacheItem) {
                                    playlistInfoCache[ownerId + '-' + playlistId] = {
                                        id: playlistId,
                                        name: plCacheItem.name,
                                        snapshot_id: plCacheItem.snapshot_id,
                                        images: [{url: plCacheItem.image}],
                                        owner: {id: plCacheItem.owner},
                                        tracks: {total: plCacheItem.tracksTotal}
                                    };
                                } else {
                                    //alle 10s !
                                    if (Pl_ListId.length > 0 && !plAppCacheReload){
                                        //versuche nachladen playlistAppCache
                                        //kann vorkommen wenn spotify-play schon aktiv während adapter-start
                                        loadPlaylistAppCache();
                                        plAppCacheReload = true; // nur 1x alle 15min (pollPlaylistApi)
                                    } else {
                                        adapter.log.debug('no playlist in playlistAppCache or playlist not found');
                                    }
                                }
                            
                                let playlistName = loadOrDefault(playlistInfoCache[ownerId + '-' + playlistId], 'name', '');
                                contextDescription = 'Playlist: ' + playlistName;
                                let playlistImage = loadOrDefault(playlistInfoCache[ownerId + '-' + playlistId], 'images[0].url', '');
                                contextImage = playlistImage;
                                let pl_ownerId = loadOrDefault(playlistInfoCache[ownerId + '-' + playlistId], 'owner.id', '');
                                let trackCount = loadOrDefault(playlistInfoCache[ownerId + '-' + playlistId], 'tracks.total', '');
                                let snapshot_id = loadOrDefault(playlistInfoCache[ownerId + '-' + playlistId], 'snapshot_id', '');
                                let prefix = shrinkStateName(ownerId + '-' + playlistId);
                                if (isEmpty(ownerId)) {
                                    if (!isEmpty(pl_ownerId)) {
                                        ownerId = pl_ownerId;
                                    }
                                }
                                //adapter.log.warn('erstelle playlistInfoCache ownerId ' + ownerId + ' plId: ' + playlistId);
                                const trackList = cache.getValue(`playlists.${prefix}.trackList`);

                                return Promise.all([
                                    cache.setValue('player.playlist.id', playlistId),
                                    cache.setValue('player.albumId', albumId),
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
                                    let trackListIdLen = loadOrDefault(cache.getValue(`playlists.${prefix}.trackListIds`), 'val', '').length;
                                    let trackListIdPlayerLen = loadOrDefault(cache.getValue('player.playlist.trackListIds'), 'val', '').length;
                                    if (!isEmpty(trackListIdLen) && !isEmpty(trackListIdPlayerLen) && trackListIdLen !== trackListIdPlayerLen) {
                                        return createPlaylists({
                                            items: [
                                                playlistInfoCache[ownerId + '-' + playlistId]
                                            ]
                                        });
                                    } else {
                                        return refreshPlaylistList();
                                    }
                                })
                                .then(() => {
                                    //Listen nach player.playlist kopieren
                                    const promises = [
                                        copyState(`playlists.${prefix}.trackListNumber`, 'player.playlist.trackListNumber'),
                                        copyState(`playlists.${prefix}.trackListString`, 'player.playlist.trackListString'),
                                        copyState(`playlists.${prefix}.trackListStates`, 'player.playlist.trackListStates'),
                                        copyObjectStates(`playlists.${prefix}.trackList`, 'player.playlist.trackList'),
                                        copyState(`playlists.${prefix}.trackListIdMap`, 'player.playlist.trackListIdMap'),
                                        copyState(`playlists.${prefix}.trackListIds`, 'player.playlist.trackListIds'),
                                        copyState(`playlists.${prefix}.trackListArray`, 'player.playlist.trackListArray')
                                    ];
                                    if (trackList && trackList.val) {
                                        adapter.log.debug('TrackList.val: ' + parseInt(trackList.val, 10));
                                        promises.push(cache.setValue('player.playlist.trackNo', (parseInt(trackList.val, 10) + 1)));
                                    }
                                    return Promise.all(promises);
                                })
                                .then(() => {
                                    //setzen der TrackNo
                                    let idLststate = cache.getValue(`playlists.${prefix}.trackListIdMap`);
                                    let stateNumbers = cache.getValue(`playlists.${prefix}.trackListNumber`);
                                    let stateSongId = cache.getValue('player.trackId');
                                    let ids = loadOrDefault(idLststate, 'val', '');
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
                                            adapter.log.debug('TrackNo: ' + (no + 1));
                                            return Promise.all([
                                                cache.setValue('player.playlist.trackNo', (no + 1)),
                                                cache.setValue(`playlists.${prefix}.trackList`, no),
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
                            contextImage = albumImage;
                            let trackCount = loadOrDefault(data, 'item.album.total_tracks', '');
                            albumCache[albumId] = {
                                album: {
                                    id: albumId,
                                    name: AlbumName,
                                    images: [{url: albumImage}]
                                },
                                total: trackCount
                            };
                            const trackList = cache.getValue(`albums.${albumId}.trackList`);
                            return Promise.all([
                                cache.setValue('player.albumId', albumId),
                                cache.setValue('player.popularity', popularity),
                                cache.setValue('player.album.id', albumId),
                                cache.setValue('player.album.popularity', popularity),
                                cache.setValue('player.album.tracksTotal', parseInt(trackCount, 10)),
                                cache.setValue('player.album.imageUrl', albumImage),
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
                                .then(() => { //error --> parseJson nicht definiert!!!
                                    let trackListIdLen = loadOrDefault(cache.getValue(`albums.${albumId}.trackListIds`), 'val', '').length;
                                    let trackListIdPlayerLen = loadOrDefault(cache.getValue('player.album.trackListIds'), 'val', '').length;
                                    if (!isEmpty(trackListIdLen) && !isEmpty(trackListIdPlayerLen) && trackListIdLen !== trackListIdPlayerLen){
                                    //if (cache.getValue(`albums.${prefix}.trackListIds`) === null) {
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
                                    let state = cache.getValue(`albums.${albumId}.trackListIdMap`);
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
                            //}
                            //});
                            /*.then(() => {
                        return Promise.all([
                            cache.setValue('player.playlist.id', ''),
                            cache.setValue('player.playlist.name', ''),
                            cache.setValue('player.playlist.owner', ''),
                            cache.setValue('player.playlist.tracksTotal', 0),
                            cache.setValue('player.playlist.snapshot_id', ''),
                            cache.setValue('player.playlist.imageUrl', ''),
                            cache.setValue('player.playlist.trackList', ''),
                            cache.setValue('player.playlist.trackListNumber', ''),
                            cache.setValue('player.playlist.trackListString', ''),
                            cache.setValue('player.playlist.trackListStates', ''),
                            cache.setValue('player.playlist.trackListIdMap', ''),
                            cache.setValue('player.playlist.trackListIds', ''),
                            cache.setValue('player.playlist.trackListArray', ''),
                            cache.setValue('player.playlist.trackNo', 0),
                            cache.setValue('playlists.playlistList', ''),
                            cache.setValue('player.playlist', null, {
                                type: 'channel',
                                common: {
                                    name: 'Commands to control playback related to the playlist'
                                },
                                native: {}
                            })
                        ])
                        .then(() => Promise.all([
                            listenOnHtmlPlaylists(),
                            listenOnHtmlTracklist()
                        ]));
                    });*/
                        } else if (type === 'collection') {
                            //Album-Daten einfügen
                            let AlbumName = loadOrDefault(data, 'item.album.name', '');
                            contextDescription = 'Collection-Album: ' + AlbumName;
                            let albumImage = loadOrDefault(data, 'item.album.images[0].url', '');
                            contextImage = albumImage;
                            let trackCount = loadOrDefault(cache.getValue('player.collection.tracksTotal'), 'val', 0); //<--anpassen gibt es nicht aus collections holen?
                            let collectionName = 'favorite Collection';
                            let collectionId = 'myFavoriteCollection';
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
                                    //if (cache.getValue(`collections.${collectionId}.trackListIds`) === null) {
                                    let trackListIdLen = loadOrDefault(cache.getValue(`collections.${collectionId}.trackListIds`), 'val', '').length;
                                    let trackListIdPlayerLen = loadOrDefault(cache.getValue('player.collection.trackListIds'), 'val', '').length;
                                    if (!isEmpty(trackListIdLen) && !isEmpty(trackListIdPlayerLen) && trackListIdLen !== trackListIdPlayerLen) {
                                        return createCollections();
                                    } else {
                                        //return refreshCollectionList(); //<<-- anpassen prüfen function
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
                                    let state = cache.getValue(`collections.${collectionId}.trackListIdMap`);
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

                } else if (type === 'episode') {
                    //type = episode player.show -Daten laden
                    if (!isEmpty(showId)){
                        let publisherState = cache.getValue('shows.' + showId + '.publisher');
                        let publisher = loadOrDefault(publisherState, 'val', '');
                        let showStateName = cache.getValue('shows.' + showId + '.name');
                        let showImageUrlState = cache.getValue('shows.' + showId + '.imageUrl');
                        let total_epiState = cache.getValue('shows.' + showId + '.episodesTotal');
                        let showName = loadOrDefault(showStateName, 'val', '');
                        let imageUrl = loadOrDefault(showImageUrlState, 'val', '');
                        let total_episodes = loadOrDefault(total_epiState, 'val', '');
                        let epiLstState = cache.getValue('shows.' + showId + '.episodeListString');
                        let epiLst = loadOrDefault(epiLstState, 'val', '').split(';');
                        contextDescription = 'Show: ' + showName;
                        //einfügen code für episodeNo ermitteln, wenn das mal möglich wird
                        let epiName = '';
                        let eno = 0;
                        if (epiLst && epiLst.length > 0) {
                            eno = parseInt(episodeNo, 10);
                            epiName = epiLst[eno];
                        }
                        const promises = [
                            cache.setValue('player.episodeId', episodeId),
                            cache.setValue('player.episodeName',epiName),
                            cache.setValue('player.show.name', showName),
                            cache.setValue('player.show.id', showId),
                            cache.setValue('player.show.imageUrl', imageUrl),
                            cache.setValue('player.show.episodesTotal', total_episodes),
                            cache.setValue('player.show.publisher', publisher),
                            cache.setValue('player.show.episodeNo',episodeNo),
                            copyState(`shows.${showId}.episodeListNumber`, 'player.show.episodeListNumber'),
                            copyState(`shows.${showId}.episodeListString`, 'player.show.episodeListString'),
                            copyState(`shows.${showId}.episodeListStates`, 'player.show.episodeListStates'),
                            copyObjectStates(`shows.${showId}.episodeList`, 'player.show.episodeList'),
                            copyState(`shows.${showId}.episodeListIdMap`, 'player.show.episodeListIdMap'),
                            copyState(`shows.${showId}.episodeListIds`, 'player.show.episodeListIds'),
                            copyState(`shows.${showId}.episodeListArray`, 'player.show.episodeListArray')
                        ];
                        return Promise.all(promises)
                            /*.then(() => {
                                return Promise.all([
                                    cache.setValue('player.playlist.id', ''),
                                    cache.setValue('player.playlist.name', ''),
                                    cache.setValue('player.playlist.owner', ''),
                                    cache.setValue('player.playlist.tracksTotal', 0),
                                    cache.setValue('player.playlist.snapshot_id', ''),
                                    cache.setValue('player.playlist.imageUrl', ''),
                                    cache.setValue('player.playlist.trackList', ''),
                                    cache.setValue('player.playlist.trackListNumber', ''),
                                    cache.setValue('player.playlist.trackListString', ''),
                                    cache.setValue('player.playlist.trackListStates', ''),
                                    cache.setValue('player.playlist.trackListIdMap', ''),
                                    cache.setValue('player.playlist.trackListIds', ''),
                                    cache.setValue('player.playlist.trackListArray', ''),
                                    cache.setValue('player.playlist.trackNo', 0),
                                    cache.setValue('playlists.playlistList', ''),
                                    cache.setValue('player.playlist', null, {
                                        type: 'channel',
                                        common: {
                                            name: 'Commands to control playback related to the playlist'
                                        },
                                        native: {}
                                    })
                                ])
                                .then(() => Promise.all([
                                    listenOnHtmlPlaylists(),
                                    listenOnHtmlTracklist()
                                ]))
                                .then(() => {
                                    return Promise.all([
                                        cache.setValue('player.album.id', ''),
                                        cache.setValue('player.album.name', ''),
                                        cache.setValue('player.album.artistName', ''),
                                        cache.setValue('player.album.popularity', 0),
                                        cache.setValue('player.album.tracksTotal', 0),
                                        cache.setValue('player.album.imageUrl', ''),
                                        cache.setValue('player.album.trackList', ''),
                                        cache.setValue('player.album.trackListNumber', ''),
                                        cache.setValue('player.album.trackListString', ''),
                                        cache.setValue('player.album.trackListStates', ''),
                                        cache.setValue('player.album.trackListIdMap', ''),
                                        cache.setValue('player.album.trackListIds', ''),
                                        cache.setValue('player.album.trackListArray', ''),
                                        cache.setValue('player.album.trackNo', 0),
                                        cache.setValue('albums.albumList', ''),
                                        cache.setValue('player.album', null, {
                                            type: 'channel',
                                            common: {
                                                name: 'Commands to control playback related to the album'
                                            },
                                            native: {}
                                        })
                                    ]);
                                });
                            });*/
                    }
                }
            })       
            .then(() => Promise.all([
                cache.setValue('player.contextImageUrl', contextImage),
                cache.setValue('player.contextDescription', contextDescription)
            ]))
            .catch(err => adapter.log.warn('createPlaybackInfo error: ' + err));
    } else {
        cache.setValue('player.isPlaying', isPlaying);
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
    let isPlaying = cache.getValue('player.isPlaying').val;
    let userId = application.userId;
    let playlistStateId = loadOrDefault(cache.getValue('player.playlist.id'), 'val', '');
    doNotTestSnapshotId = true;
    if (isPlaying && !isEmpty(userId) && !isEmpty(playlistStateId)) {
        return sendRequest(`/v1/users/${userId}/playlists/${playlistStateId}`, 'GET', '')
            .then(data => createPlaylists({ items: [data]}))
            .then(() => {
                    copyState('playlists.'+ playlistStateId + '.trackListArray', 'player.playlist.trackListArray');
                    doNotTestSnapshotId = false;
            })
            .catch(err => adapter.log.warn('error in getCurrentPlaylist: ' + err));      
    } else {
        reloadUsersPlaylist();
    }
}

/*default run all 15 min from pollPlaylistApi()*/
function reloadUsersPlaylist() {
    return getUsersPlaylist(0)
        .then(addedList => {
            if (application.deletePlaylists) {
                return deleteUsersPlaylist(addedList);
            }
        })
        .then(() => {
            refreshPlaylistList();
            loadPlaylistAppCache();
            plAppCacheReload = false;
            
        });
}

function reloadUsersShows() {
    return getUsersShows(0)
        .then(addedList => {
            if (application.deletePlaylists) {
                return deleteUsersShows(addedList);
            }
        })
        .then(() => refreshShowsList());
}

function reloadUsersAlbums() {
    return getUsersAlbum(0)
        .then(addedList => {
            if (application.deletePlaylists) {
                return deleteUsersAlbums(addedList);
            }
        })
        .then(() => refreshAlbumList());
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
            key !== 'albums.albumListString'
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
                createOrDefault(item.show, 'images[0].url', prefix + '.imageUrl', '', 'image url', 'string')
            ])
            .then(() => getShowEpisodes(showId))
            .then(showObject => {
                if (showObject.episodes.length > 0) {
                
                    let episodesListValue = '';
                    let statecurrSID = cache.getValue('player.show.id');
                    let currentShowId = loadOrDefault(statecurrSID, 'val', '');
                    let stateEpisodeId = cache.getValue('player.episodeId');
                    let episodesId = loadOrDefault(stateEpisodeId, 'val', '');

                    if (`${episodesId}` === `${currentShowId}`) {
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
                return getUsersShows(parseJson.offset + parseJson.limit, addedList);
            } else {
                return addedList;
            }
        });
    } catch(err) {
        adapter.log.warn('error on createShows: ' + err);
    }
}

function findPlaylistSnapshotId(owner, playlistId, snapIdToFind) {
    if (!isEmpty(owner) && !isEmpty(playlistId) && !isEmpty(snapIdToFind) && playlistAppCache.length > 0) {
        //suche snapshotId für playlistId
        let x = -1;
        let prefix = owner + '-' + playlistId;
        let snapId = '';
        for (let i = 0; i < playlistAppCache.length; i++) {
            if (playlistAppCache[i].appId === prefix) {
                x = i;
                break;
            }
        }
        if ( x >= 0) {
            snapId = playlistAppCache[x].snapshot_id;
            //verkürzte snapshotId prüfen (10 Zeichen + 4 Zeichen) Rest prüfen
            let _snapId = '';
            let _snapId10 = '';
            let _snapIdToFind10 = '';
            let _snapIdToFind = '';
            if ((snapId.length > 15) && (snapIdToFind.length > 15)) {
                _snapId10 = snapId.substring(0, 9);
                _snapIdToFind10 = snapIdToFind.substring(0, 9);
                _snapId = snapId.substring(14);
                _snapIdToFind = snapIdToFind.substring(14);
                if (_snapId10 === _snapIdToFind10) {
                    if (_snapId === _snapIdToFind) {
                        pl_foundCount += 1;
                        return true;
                    } else {
                        pl_notFoundCount += 1;
                        return false;
                    }
                } else {
                    pl_notFoundCount += 1;
                    return false;
                }
            }
            if (snapId === snapIdToFind){
                adapter.log.debug('x: ' + x + ' id: ' + prefix + ' snapCache: ' + snapId + ' snap-spoti: ' + snapIdToFind);
                pl_foundCount += 1;
                return true;
            } else {
                pl_notFoundCount += 1;
            }
        }
    }
    return false;
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
            playlistInfoCache[ownerId + '-' + playlistId] = {
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
            //snapshot selection
            if (doNotTestSnapshotId || !findPlaylistSnapshotId(ownerId, playlistId, snapshot_id)) {
                //nur ausführen wenn snapshotId aus playlistAppCache <> snapshot_id aus Datensatz od. id nicht gefunden
                adapter.log.debug('current snapshot_id not found: (' + ownerId + '-' + playlistId + ') - load new playlist data from spotify');
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
                    createOrDefault(item, 'id', prefix + '.id', '', 'playlist id', 'string'),
                    createOrDefault(item, 'owner.id', prefix + '.owner', '', 'playlist owner', 'string'),
                    createOrDefault(item, 'name', prefix + '.name', '', 'playlist name', 'string'),
                    createOrDefault(item, 'snapshot_id', prefix + '.snapshot_id', '', 'snapshot_id', 'string'),
                    createOrDefault(item, 'tracks.total', prefix + '.tracksTotal', 0, 'number of songs', 'number'),
                    createOrDefault(item, 'images[0].url', prefix + '.imageUrl', '', 'image url', 'string')
                ])
                    .then(() => getPlaylistTracks(ownerId, playlistId))
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
                                createOrDefault(playlistObject, 'songs', prefix + '.trackListArray', '',
                                    'contains list of tracks as array object, pattern:\n[{id: "id",\ntitle: "title",\nartistName: "artistName1, artistName2",\nartistArray: [{id: "artistId", name: "artistName"}, {id: "artistId", name: "artistName"}, ...],\nalbum: {id: "albumId", name: "albumName"},\ndurationMs: 253844,\nduration: 4:13,\naddedAt: 15395478261235,\naddedBy: "userId",\ndiscNumber: 1,\nepisode: false,\nexplicit: false,\npopularity: 56\n}, ...]',
                                    'object')
                            ]);
                        }
                    });
            } else {
                adapter.log.debug('found: (' + ownerId + '-' + playlistId + ') current snapshot_id - continue next playlist');
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
            return getUsersPlaylist(parseJson.offset + parseJson.limit, addedList);
        } else {
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
        let albumName = loadOrDefault(item.album, 'name', '');
        if (isEmpty(albumName)) {
            adapter.log.warn('empty album name');
            return Promise.reject('empty album name');
        }
        let artistName = loadOrDefault(item.album, 'artists[0].name', '');
        albumName = artistName + '-' + albumName;
        let albumId = loadOrDefault(item.album, 'id', '');
        let trackCount = loadOrDefault(item.album, 'tracks_total', '');
        let imageUrl = loadOrDefault(item.album, 'images[0].url', '');
        let popularity = loadOrDefault(item.album, 'popularity', 0);
        
        albumCache[albumId] = {
            id: albumId,
            name: albumName,
            images: [{url: imageUrl}],
            tracks: {total: trackCount}
        };

        let prefix = 'albums.' + shrinkStateName(albumId);
        addedList = addedList || [];
        addedList.push(prefix);

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
            createOrDefault(item.album, 'popularity', prefix + '.popularity', '', 'album popularity', 'number'),
            createOrDefault(item.album, 'total_tracks', prefix + '.tracksTotal', 0, 'number of songs', 'number'),
            createOrDefault(item.album, 'images[0].url', prefix + '.imageUrl', '', 'image url', 'string')
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

                        createOrDefault(albumObject, 'listNumber', prefix + '.trackListNumber', '',
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
    };

    let p = Promise.resolve();
    for (let i = 0; i < parseJson.items.length; i++) {
        p = p
            .then(() => new Promise(resolve => setTimeout(() => !stopped && resolve(), 1000)))
            .then(() => fn(parseJson.items[i]));
    }

    return p.then(() => {
        if (autoContinue && parseJson.items.length !== 0 && (parseJson['next'] !== null)) {
            return getUsersAlbum(parseJson.offset + parseJson.limit, addedList);
        } else {
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
    } else {
        adapter.log.warn('no userId');
        return Promise.reject('no userId');
    }
}

function getUsersPlaylist(offset, addedList) {
    addedList = addedList || [];

    if (!isEmpty(application.userId)) {
        let query = {
            limit: 50,
            offset: offset
        };
        return sendRequest(`/v1/users/${application.userId}/playlists?${querystring.stringify(query)}`, 'GET', '')
            .then(parsedJson => createPlaylists(parsedJson, true, addedList))
            .catch(err => adapter.log.warn('getUsersPlaylist warning ' + err));
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
                let plName = loadOrDefault(cache.getValue(prefix + '.name'), 'val','empty');
                let snapshot_id = loadOrDefault(cache.getValue(prefix + '.snapshot_id'),'val', '');
                let plImage = loadOrDefault(cache.getValue(prefix + '.imageUrl'), 'val', '');
                let owner = loadOrDefault(cache.getValue(prefix + '.owner'), 'val', '');
                let trackCount = loadOrDefault(cache.getValue(prefix + '.tracksTotal'), 'val', '');
                let songs = loadOrDefault(cache.getValue(prefix + '.trackListArray'), 'val', []);     
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
            adapter.log.debug('loadPlaylistAppCache gestartet playlist-count: ' + cnt);
        }
    } catch(err) {
        adapter.log.warn('error in loadPlaylistAppCache err: ' + err);
    }
    return;
}

function getPlaylistCacheItem(owner, playlistId) {
    if (!isEmpty(owner) && !isEmpty(playlistId) && playlistAppCache.length > 0) {
        let toFindId = owner + '-' + playlistId;
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
        let query = {
            limit: 50,
            offset: offset
        };
        return sendRequest(`/v1/me/albums?${querystring.stringify(query)}`, 'GET', '')
            .then(parsedJson => createAlbums(parsedJson, true, addedList))
            .catch(err => adapter.log.warn('getUsersAlbum warning ' + err));
    } else {
        adapter.log.warn('no userId');
        return Promise.reject('no userId');
    }
}

function getUsersShows(offset, addedList) {
    addedList = addedList || [];

    if (!isEmpty(application.userId)) {
        let query = {
            limit: 50,
            offset: offset
        };
        return sendRequest(`/v1/me/shows?${querystring.stringify(query)}`, 'GET', '')
            .then(parsedJson => createShows(parsedJson, true, addedList))
            .catch(err => adapter.log.warn('getUsersShows warning ' + err));
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
            let no = i.toString();
            if (!isEmpty(data)) {
                let showDescription = loadOrDefault(data, 'description', '');
                let showExplicit = loadOrDefault(data, 'explicit', false);
                let showImages = loadOrDefault(data, 'images[0].url', '');
                let showName = loadOrDefault(data, 'name', '');
                let showPublisher = loadOrDefault(data, 'publisher', '');
                let showTotal_episodes = loadOrDefault(data, 'total_episodes', 0);
                let showType = loadOrDefault(data, 'type', '');
                let showUri = loadOrDefault(data, 'uri', '');
                if (!isEmpty(data.episodes) && data.episodes.items.length > 0) {
                    data.episodes.items.forEach(item => {
                        let episodesId = loadOrDefault(item, 'id', ''); 
                        no = i.toString();
                        if (isEmpty(episodesId)) {
                            return adapter.log.debug(
                                `There was a show episode ignored because of missing id; episodesId: ${episodesId}; no: ${no}`);
                        }
                        let description = loadOrDefault(item, 'description', '');
                        let duration_ms = loadOrDefault(item, 'duration_ms', 0);
                        let explicit = loadOrDefault(item, 'explicit', false);
                        let is_playable = loadOrDefault(item, 'is_playable', false);
                        let images = loadOrDefault(item, 'images[0].url', '');
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
                            showObject.episodeDuration_msList += ';';
                            showObject.episodeIds += ';';
                            showObject.listNumber += ';';
                        }
                        let tmpstate = no + ':' + name;
                        showObject.stateString += tmpstate;
                        showObject.listString += name;
                        showObject.episodeIdMap += episodesId;
                        showObject.episodeDuration_msList += duration_ms;
                        let tmpids = no + ':' + episodesId;
                        showObject.episodeIds += tmpids;
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

async function getPlaylistTracks(owner, id) {
    const playlistObject = {
        stateString: '',
        listString: '',
        listNumber: '',
        trackIdMap: '',
        trackIds: '',
        songs: []
    };
    let offset = 0;
    let regParam = `${owner}/playlists/${id}/tracks`;
    while (true) {
        const query = {
        limit: 50,
        offset: offset,
        market: 'DE'
        };
        try {
            const data = await sendRequest(`/v1/users/${regParam}?${querystring.stringify(query)}`, 'GET', '');
            let i = offset;
            let no = i.toString();
            if (!isEmpty(data) && !isEmpty(data.items) && data.items.length > 0) {
                data.items.forEach(item => {
                    let trackId = loadOrDefault(item, 'track.id', ''); 
                    no = i.toString();
                    if (isEmpty(trackId)) {
                        return adapter.log.debug(
                            `There was a playlist track ignored because of missing id; playlist: ${id}; track no: ${no}`);
                    }
                    let artist = getArtistNamesOrDefault(item, 'track.artists');
                    let artistArray = getArtistArrayOrDefault(item, 'track.artists');
                    let trackName = loadOrDefault(item, 'track.name', '');
                    let trackDuration = loadOrDefault(item, 'track.duration_ms', '');
                    let addedAt = loadOrDefault(item, 'addedAt', '');
                    let addedBy = loadOrDefault(item, 'addedBy', '');
                    let trackAlbumId = loadOrDefault(item, 'track.album.id', '');
                    let trackAlbumName = loadOrDefault(item, 'track.album.name', '');
                    let trackDiscNumber = loadOrDefault(item, 'track.disc_number', 1);
                    let trackEpisode = loadOrDefault(item, 'track.episode', false);
                    let trackExplicit = loadOrDefault(item, 'track.explicit', false);
                    let trackPopularity = loadOrDefault(item, 'track.popularity', 0);
                    let trackIsPlayable = loadOrDefault(item, 'track.is_playable', false);
                    if (playlistObject.songs.length > 0) {
                        playlistObject.stateString += ';';
                        playlistObject.listString += ';';
                        playlistObject.trackIdMap += ';';
                        playlistObject.trackIds += ';';
                        playlistObject.listNumber += ';';
                    }
                    playlistObject.stateString += no +':' + trackName + '-' + artist;
                    playlistObject.listString += trackName + '-' + artist;
                    playlistObject.trackIdMap += trackId;
                    playlistObject.trackIds += no + ':' + trackId;
                    playlistObject.listNumber += no;
                    let a = {
                        id: trackId,
                        title: trackName,
                        artistName: artist,
                        artistArray: artistArray,
                        album: {id: trackAlbumId, name: trackAlbumName},
                        durationMs: trackDuration,
                        duration: convertToDigiClock(trackDuration),
                        addedAt: addedAt,
                        addedBy: addedBy,
                        discNumber: trackDiscNumber,
                        episode: trackEpisode,
                        explicit: trackExplicit,
                        popularity: trackPopularity,
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
            adapter.log.warn('error on load tracks(getPlaylistTracks): ' + err + ' owner: ' + owner + ' id: ' + id);
            break;
        }
    }
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
            let no = i.toString();
            //adapter.log.warn('trackData: ' + querystring.stringify(data.items));
            if (data && data.items && data.items.length > 0) {
                data.items.forEach(item => {
                    let trackId = loadOrDefault(item, 'id', ''); 
                    no = i.toString();
                    if (isEmpty(trackId)) {
                        return adapter.log.debug(
                            `There was a album track ignored because of missing id; album: ${albumId}; track no: ${no}`);
                    }
                    
                    let artist = getArtistNamesOrDefault(item, 'artists');
                    let artistArray = getArtistArrayOrDefault(item, 'artists');
                    let trackName = loadOrDefault(item, 'name', '');
                    let trackDuration = loadOrDefault(item, 'duration_ms', '');
                    let trackDiscNumber = loadOrDefault(item, 'disc_number', 1);
                    let trackExplicit = loadOrDefault(item, 'explicit', false);
                    let track_number = loadOrDefault(item, 'track_number', '');
                    if (albumObject.songs.length > 0) {
                        albumObject.stateString += ';';
                        albumObject.listString += ';';
                        albumObject.trackIdMap += ';';
                        albumObject.trackIds += ';';
                        albumObject.listNumber += ';';
                    }
                    let tmpStr = no + ':' + trackName + '-' + artist;
                    let tmpTrk = no + ':' + trackId;
                    albumObject.stateString += tmpStr;
                    albumObject.listString += trackName + '-' + artist;
                    albumObject.trackIdMap += trackId;
                    albumObject.trackIds += tmpTrk;
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
            let no = i.toString();
            //adapter.log.warn('trackData: ' + querystring.stringify(data.items));
            if (data && data.items && data.items.length > 0) {
                trackCount = loadOrDefault(data, 'total', 0);
                data.items.forEach(item => {
                    let trackId = loadOrDefault(item.track, 'id', ''); 
                    no = i.toString();
                    if (isEmpty(trackId)) {
                        return adapter.log.warn(
                            `There was a collection track ignored because of missing id; track no: ${no}`);
                    }
                    
                    let artist = getArtistNamesOrDefault(item.track, 'artists');
                    let artistArray = getArtistArrayOrDefault(item.track, 'artists');
                    let trackName = loadOrDefault(item.track, 'name', '');
                    let trackDuration = loadOrDefault(item.track, 'duration_ms', '');
                    let trackDiscNumber = loadOrDefault(item.track, 'disc_number', 1);
                    let trackExplicit = loadOrDefault(item.track, 'explicit', false);
                    let trackPopularity = loadOrDefault(item.track, 'popularity',0);
                    let track_number = loadOrDefault(item.track, 'track_number', '');
                    if (collectionObject.songs.length > 0) {
                        collectionObject.stateString += ';';
                        collectionObject.listString += ';';
                        collectionObject.trackIdMap += ';';
                        collectionObject.trackIds += ';';
                        collectionObject.listNumber += ';';
                    }
                    let tmpStr = no + ':' + trackName + '-' + artist;
                    let tmpTrk = no + ':' + trackId;
                    collectionObject.stateString += tmpStr;
                    collectionObject.listString += trackName + '-' + artist;
                    collectionObject.trackIdMap += trackId;
                    collectionObject.trackIds += tmpTrk;
                    collectionObject.listNumber += no;
                    let a = {
                        id: trackId,
                        title: trackName,
                        artistName: artist,
                        artistArray: artistArray,
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
                .then(() => refreshDeviceList());
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
        let id = normKey.substring(10, normKey.length - 5);
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
        });
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
                setObjectStatesIfChanged('playlists.playlistList', stateList),
                cache.setValue('playlists.playlistListIds', listIds),
                cache.setValue('playlists.playlistListString', listString),
                cache.setValue('playlists.yourPlaylistListIds', yourIds),
                cache.setValue('playlists.yourPlaylistListString', yourString)
            ]);
        })
        .then(() => {
            let id = cache.getValue('player.playlist.id').val;
            if (id) {
                let owner = cache.getValue('player.playlist.owner').val;
                if (owner) {
                    return cache.setValue('playlists.playlistList', owner + '-' + id);
                }
            }
        });
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
        a.push({
            id: id,
            name: states[key].val,
            artist: artist
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
            let listArtist = '';
            for (let i = 0, len = a.length; i < len; i++) {
                let normId = a[i].id;
                let normName = cleanState(a[i].name);
                let normArtist = a[i].artist;
                if (listIds.length > 0) {
                    listIds += ';';
                    listString += ';';
                    listArtist += ';';
                }
                stateList[normId] = normName;
                listIds += normId;
                listString += normName;
                listArtist += normArtist;
            }
            return Promise.all([
                setObjectStatesIfChanged('albums.albumList', stateList),
                cache.setValue('albums.albumListIds', listIds),
                cache.setValue('albums.albumListString', listString),
                cache.setValue('albums.artistList', listArtist)
            ]);
        })
        .then(() => {
            let idState = cache.getValue('player.album.id');
            if (idState) {
                let id = loadOrDefault(idState,'val', '');
                return cache.setValue('albums.albumList', id);    
            }
        });
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
            id,
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
        .then(() => listenOnHtmlDevices());
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
    clearTimeout(application.requestPollingHandle);
    //ausgabe der werte
    cache.setValue('requestCount',RequestCount);
    RequestCount = 0;
    scheduleRequestPolling();
}

function scheduleRequestPolling() {
    clearTimeout(application.requestPollingHandle);
    application.requestPollingHandle = setTimeout(() => !stopped && pollRequestCount(), 60000);
}

function scheduleStatusPolling() {
    clearTimeout(application.statusPollingHandle);
    if (application.statusPollingDelaySeconds > 0) {
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
                if (!noReschedule) {
                    scheduleStatusPolling();
                }
            }

        })
        .catch(err => {
            if (err !== 202) {
                application.error202shown = false;
            }
            //if (err === 202 || err === 401 || err === 502) {
            if (err === 202 || err === 401 || err === 500 || err === 502 || err === 503 || err === 504) {
                if (err === 202) {
                    if (!application.error202shown) {
                        adapter.log.debug(
                            'unexpected api response http 202; continue polling; nothing is wrong with the adapter; you will see a 202 response the first time a user connects to the spotify connect api or when the device is temporarily unavailable'
                        );
                    }
                    application.error202shown = true;
                } else {
                    adapter.log.warn('pollStatusApi: unexpected response http ' + err + '; continue polling');
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
    if (application.playlistPollingDelaySeconds > 0) {
        application.playlistPollingHandle = setTimeout(() => !stopped && pollPlaylistApi(), application.playlistPollingDelaySeconds *
            1000);
    }
}

function scheduleAlbumPolling() {
    clearTimeout(application.albumPollingHandle);
    if (application.albumPollingDelaySeconds > 0) {
        application.albumPollingHandle = setTimeout(() => !stopped && pollAlbumApi(), application.albumPollingDelaySeconds *
            1000);
    }
}

function scheduleShowPolling() {
    clearTimeout(application.showPollingHandle);
    if (application.showPollingDelaySeconds > 0) {
        application.showPollingHandle = setTimeout(() => !stopped && pollShowApi(), application.showPollingDelaySeconds *
            1000);
    }
}

/* default run all 15 min */
function pollPlaylistApi() {
    //clearTimeout(application.playlistInternalTimer);
    clearTimeout(application.playlistPollingHandle);
    loadPlaylistAppCache();
    reloadUsersPlaylist();
    cache.setValue('pl_found', pl_foundCount);
    cache.setValue('pl_notFound', pl_notFoundCount);
    pl_foundCount = 0;
    pl_notFoundCount = 0;
    adapter.log.debug('call playlist polling');
    loadPlaylistAppCache();
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
    let episodeLst = cache.getValue('shows.' + showId + '.episodeListIdMap').val.split(';');
    let dur_msLst = cache.getValue('shows.' + showId + '.episodeDuration_msList');
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
                .then(() => setTimeout(() => !stopped && pollStatusApi(true), 1000))
                .catch(err => adapter.log.error(`could not start show ${showId}; error: ${err}`));
        })
        .then(() => {
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
        });
    }

function startPlaylist(playlist, owner, trackNo, keepTrack) {
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
            let send = {
                context_uri: `spotify:user:${owner}:playlist:${playlist}`,
                offset: {
                    position: trackNo
                }
            };
            let d_Id = getSelectedDevice(deviceData);
            return sendRequest('/v1/me/player/play?device_id=' + d_Id, 'PUT', JSON.stringify(send), true)
                .then(() => setTimeout(() => !stopped && pollStatusApi(true), 1000))
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
                .then(() => setTimeout(() => !stopped && pollStatusApi(true), 1000))
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
            if (adapter.config.defaultRepeat === 'context') {
                return listenOnRepeatContext();
            } else {
                return listenOnRepeatOff();
            }
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
                .then(() => setTimeout(() => !stopped && pollStatusApi(true), 1000))
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
            if (adapter.config.defaultRepeat === 'context') {
                return listenOnRepeatContext();
            } else {
                return listenOnRepeatOff();
            }
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
        scope: 'user-modify-playback-state user-read-playback-state user-read-currently-playing playlist-read-private user-library-read user-library-modify'
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
                    let waiting = 300 * 1000;
                    if ((pl_poll && !alb_poll) || (!pl_poll && alb_poll)) {
                        // wait for 5 min playlist or album polling
                        myAlTimeOut = setTimeout(() => !stopped && scheduleShowPolling(), waiting);
                    } else if (pl_poll && alb_poll) {
                        // wait for 10 min playlist & album polling is active
                        waiting = 600 * 1000;
                        myAlTimeOut = setTimeout(() => !stopped && scheduleShowPolling(), waiting);
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
        .then(() => setTimeout(() => !stopped && pollStatusApi(true), 1000))
        .catch(err => adapter.log.error('listenOnUseForPlayback could not execute command: ' + err));
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
            listOnPlayThisCollection(obj, obj.state.val);
        }
    }
}

function listenOnEpisodeList(obj) {
    if (obj.state.val >= 0) {
        let showid = cache.getValue(obj.id.slice(0, obj.id.lastIndexOf('.')) + '.id');
        if (showid && !isEmpty(showid.val)){
            let eid = cache.getValue('shows.' + showid.val + '.episodeListIdMap');
            if (eid && eid.val && !isEmpty(eid.val)){
                let ixList = eid.val.split(';');
                let episodeId = ixList[obj.state.val];
                if (episodeId && !isEmpty(episodeId)){
                    //adapter.log.warn('listenOnEpisodeList obj.slice... obj.state.val: ' + obj.state.val + ' episodeId: ' + episodeId);
                    lastPlayingShow.lastShowId = showid;
                    lastPlayingShow.lastEpisodeNo = obj.state.val;
                    lastPlayingShow.lastEpisodeId = episodeId;
                    let dur_msLst = cache.getValue('shows.' + showid + '.episodeDuration_msList');
                    if (dur_msLst && dur_msLst.val) {
                        let durLst = dur_msLst.val.split(';');
                        if (durLst.length > 0){
                            lastPlayingShow.lastEpisodeDuration_ms = durLst[obj.state.val];
                        } else {
                            lastPlayingShow.lastEpisodeDuration_ms = dur_msLst.val;
                        }
                        
                    }
                    listenOnEpisodeId(episodeId);
                }
            }
        }
    }
}

//Funktion zum Reaktivieren des letzten Device mit play
function transferPlayback(dev_id){
    if (!isEmpty(dev_id)){
        let send = {
            device_ids: [dev_id],
            play: true
        };
        adapter.log.debug('transferPlayback gestartet');
        return sendRequest('/v1/me/player', 'PUT', JSON.stringify(send), true)
            .then(() => setTimeout(() => !stopped && pollStatusApi(true), 1000))
            .catch(err => adapter.log.error('transferPlayback could not execute command: ' + err + ' device_id: ' + dev_id));  
    } else {
        adapter.log.debug('transferPlayback: dev_id is empty');
    }
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
    return startPlaylist(id, owner, pos, keepTrack);
}

function listOnPlayThisCollection(obj, pos) {
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
        listenOnUseForPlayback({id: `devices.${obj.state.val}.useForPlayback`});
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

    clearTimeout(application.statusInternalTimer);
    sendRequest('/v1/me/player/play?' + querystring.stringify(query), 'PUT', send, true)
        .catch(err => adapter.log.error('listenOnPlayUri could not execute command: ' + err))
        .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
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
                cache.setValue('player.device.isAvailable', false);
                return;
            }
        }

    } else {
        //normaler play wenn device.isActive
        let query = {
            device_id: getSelectedDevice(deviceData)
        };
        adapter.log.debug('lastSelect: ' + deviceData.lastSelectDeviceId + ' lastActive: ' + deviceData.lastActiveDeviceId);
        clearTimeout(application.statusInternalTimer);
        sendRequest('/v1/me/player/play?' + querystring.stringify(query), 'PUT', '', true)
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
    clearTimeout(application.statusInternalTimer);
    sendRequest('/v1/me/player/pause?' + querystring.stringify(query), 'PUT', '', true)
        .catch(err => adapter.log.error('listenOnPause could not execute command: ' + err))
        .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
}

function listenOnSkipPlus() {
    let query = {
        device_id: getSelectedDevice(deviceData)
    };
    clearTimeout(application.statusInternalTimer);
    sendRequest('/v1/me/player/next?' + querystring.stringify(query), 'POST', '', true)
        .catch(err => adapter.log.error('listenOnSkipPlus could not execute command: ' + err))
        .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
}

function listenOnSkipMinus() {
    let query = {
        device_id: getSelectedDevice(deviceData)
    };
    clearTimeout(application.statusInternalTimer);
    sendRequest('/v1/me/player/previous?' + querystring.stringify(query), 'POST', '', true)
        .catch(err => adapter.log.error('listenOnSkipMinus could not execute command: ' + err))
        .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
}

function listenOnRepeat(obj) {
    if (['track', 'context', 'off'].indexOf(obj.state.val) >= 0) {
        clearTimeout(application.statusInternalTimer);
        sendRequest('/v1/me/player/repeat?state=' + obj.state.val, 'PUT', '', true)
            .catch(err => adapter.log.error('listenOnRepeat could not execute command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
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
    let is_play = cache.getValue('player.isPlaying');
    let d_Id = getSelectedDevice(deviceData);
    if (is_play && is_play.val) {
        clearTimeout(application.statusInternalTimer);
        sendRequest('/v1/me/player/volume?volume_percent=' + obj.state.val + '&device_id=' + d_Id, 'PUT', '', true)
            .catch(err => adapter.log.error('could not execute volume-command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    }
}

function listenOnProgressMs(obj) {
    let progress = obj.state.val;
    clearTimeout(application.statusInternalTimer);

    sendRequest('/v1/me/player/seek?position_ms=' + progress, 'PUT', '', true).then(function () {
        const durationState = cache.getValue('player.durationMs');
        if (durationState) {
            let duration = durationState.val;

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
        .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
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
                .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
        }
    }
}

function listenOnShuffle(obj) {
    clearTimeout(application.statusInternalTimer);
    return sendRequest('/v1/me/player/shuffle?state=' + (obj.state.val === 'on' ? 'true' : 'false'), 'PUT', '', true)
        .catch(err => adapter.log.error('could not execute command: ' + err))
        .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
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
    clearTimeout(application.statusInternalTimer);
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
        clearTimeout(application.statusInternalTimer);
        sendRequest('/v1/me/player/play?device_id=' + d_Id, 'PUT', JSON.stringify(send), true)
            .catch(err => adapter.log.error('listenOnShowId could not execute command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    }
}

function listenOnEpisodeId(obj) {
    if (obj && obj.state && obj.state.val) {
        let d_Id = getSelectedDevice(deviceData);
        let send = {
            uri: ['spotify:episode:' + obj.state.val]
        };
        clearTimeout(application.statusInternalTimer);
        sendRequest('/v1/me/player/play?device_id=' + d_Id, 'PUT', JSON.stringify(send), true)
            .catch(err => adapter.log.error('listenOnEpisodeId could not execute command: ' + err))
            .then(() => setTimeout(() => !stopped && pollStatusApi(), 1000));
    }
}

function listenOnPlaylistId(obj) {
    const ownerState = cache.getValue('player.playlist.owner');
    if (!ownerState) {
        return;
    }
    return startPlaylist(obj.state.val, ownerState.val, 0);
}

function listenOnAlbumId(obj) {
    return startAlbum(obj.state.val, 0);
}

function listenOnPlaylistOwner(obj) {
    const PlayListIdState = cache.getValue('player.playlist.id');
    if (!PlayListIdState) {
        return;
    }
    return startPlaylist(PlayListIdState.val, obj.state.val, 0);
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

    return startPlaylist(id, owner, o - 1, true);
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
    let id = showIdState.val;
    let o = obj.state.val;
    o = parseInt(o, 10) || 1;

    return startShow(id, o - 1, true);
}

function listenOnGetPlaybackInfo() {
    return pollStatusApi(true);
}

function listenOnGetDevices() {
    return sendRequest('/v1/me/player/devices', 'GET', '')
        .then(data => reloadDevices(data));
}

function clearCache() {
    artistImageUrlCache = {};
    playlistInfoCache = {};
    application.cacheClearHandle = setTimeout(() => !stopped && clearCache(), 1000 * 60 * 60 * 24);
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
