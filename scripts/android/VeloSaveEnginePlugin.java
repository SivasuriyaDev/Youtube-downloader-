package com.velosave.downloader;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLException;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import kotlin.Unit;
import kotlin.jvm.functions.Function3;

@CapacitorPlugin(
    name = "VeloSaveEngine",
    permissions = {
        @Permission(
            alias = "storage",
            strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }
        )
    }
)
public class VeloSaveEnginePlugin extends Plugin {
    private static final String MOBILE_UA =
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

    private static final Set<String> YOUTUBE_HOSTS = new HashSet<>(Arrays.asList(
        "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"
    ));

    private static final Set<String> INSTAGRAM_HOSTS = new HashSet<>(Arrays.asList(
        "instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am"
    ));

    private static final Set<String> SPOTIFY_HOSTS = new HashSet<>(Arrays.asList(
        "open.spotify.com", "play.spotify.com"
    ));

    private static final List<String> ALLOWED_CDN_SUFFIXES = Arrays.asList(
        ".ytimg.com", ".youtube.com", ".googlevideo.com",
        ".cdninstagram.com", ".fbcdn.net", ".scdn.co", ".spotifycdn.com"
    );

    private static final Pattern NEXT_DATA_PATTERN = Pattern.compile(
        "<script\\s+id=\"__NEXT_DATA__\"\\s+type=\"application/json\">([\\s\\S]*?)</script>"
    );

    private static final Pattern URL_IN_TEXT_PATTERN = Pattern.compile("https?://[^\\s]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern YT_ID_PATTERN = Pattern.compile("^[a-zA-Z0-9_-]{11}$");
    private static final Pattern YT_LIST_PATTERN = Pattern.compile("^[a-zA-Z0-9_-]{2,80}$");
    private static final Pattern IG_CODE_PATTERN = Pattern.compile("^[a-zA-Z0-9_-]{5,32}$");
    private static final Pattern SPOTIFY_ID_PATTERN = Pattern.compile("^[a-zA-Z0-9]{10,40}$");
    private static final Pattern FORMAT_SELECTOR_PATTERN = Pattern.compile("^[a-zA-Z0-9_+<=\\[\\]/,-]{1,64}$");

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Object initLock = new Object();
    private final Set<String> cancelledTasks = ConcurrentHashMap.newKeySet();
    private volatile boolean engineInitialized = false;
    private volatile String pendingSharedUrl = null;

    @Override
    public void load() {
        super.load();
        if (getActivity() != null) {
            captureShareIntent(getActivity().getIntent());
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String url = captureShareIntent(intent);
        if (url != null) {
            JSObject payload = new JSObject();
            payload.put("url", url);
            notifyListeners("sharedUrlReceived", payload);
        }
    }

    private String captureShareIntent(Intent intent) {
        if (intent == null) return null;
        String action = intent.getAction();
        String candidate = null;
        if (Intent.ACTION_SEND.equals(action)) {
            candidate = intent.getStringExtra(Intent.EXTRA_TEXT);
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            candidate = intent.getData().toString();
        }
        if (candidate == null || candidate.trim().isEmpty()) {
            return null;
        }
        Matcher m = URL_IN_TEXT_PATTERN.matcher(candidate);
        while (m.find()) {
            String raw = m.group().replaceAll("[),.!?;:'\"]+$", "");
            if (parseMediaTarget(raw) != null) {
                pendingSharedUrl = raw;
                return raw;
            }
        }
        return null;
    }

    @PluginMethod
    public void consumePendingShareUrl(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("url", pendingSharedUrl);
        pendingSharedUrl = null;
        call.resolve(ret);
    }

    private void ensureInitialized() throws Exception {
        if (engineInitialized) return;
        synchronized (initLock) {
            if (engineInitialized) return;
            Context appCtx = getContext().getApplicationContext();
            YoutubeDL.getInstance().init(appCtx);
            FFmpeg.getInstance().init(appCtx);
            engineInitialized = true;
        }
    }

    @PluginMethod
    public void health(PluginCall call) {
        executor.execute(() -> {
            try {
                ensureInitialized();
                String version = YoutubeDL.getInstance().versionName(getContext().getApplicationContext());
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("engine", "android-inbuilt");
                ret.put("ffmpeg", true);
                ret.put("ytdlpVersion", version != null ? version : "bundled");
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Inbuilt Android engine failed to initialize: " + safeErrorMessage(e), "INIT_FAILED", e);
            }
        });
    }

    @PluginMethod
    public void inspect(PluginCall call) {
        final String rawUrl = call.getString("url", "").trim();
        final MediaTarget target = parseMediaTarget(rawUrl);
        if (target == null) {
            call.reject("Unsupported or invalid link. Paste a YouTube, Instagram, or Spotify URL.", "INVALID_URL");
            return;
        }

        executor.execute(() -> {
            try {
                JSObject result;
                if ("spotify".equals(target.platform)) {
                    result = inspectSpotifyPublicMetadata(target);
                } else if ("youtube".equals(target.platform) && "playlist".equals(target.contentType)) {
                    ensureInitialized();
                    result = inspectYouTubePlaylist(target);
                } else {
                    ensureInitialized();
                    result = inspectSingleViaYtDlp(target);
                    if (target.playlistUrl != null) {
                        result.put("playlistUrl", target.playlistUrl);
                    }
                }
                call.resolve(result);
            } catch (Exception e) {
                call.reject(safeErrorMessage(e), "INSPECT_FAILED", e);
            }
        });
    }

    @PluginMethod
    public void download(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "handleStoragePermissionResult");
            return;
        }
        startDownloadWorker(call);
    }

    @PermissionCallback
    private void handleStoragePermissionResult(PluginCall call) {
        startDownloadWorker(call);
    }

    private void startDownloadWorker(PluginCall call) {
        final String taskId = sanitizeTaskId(call.getString("taskId", ""));
        final String rawUrl = call.getString("url", "").trim();
        final String rawQuery = call.getString("query", "").trim();
        final String rawDirectUrl = call.getString("directUrl", "").trim();
        final String rawItag = call.getString("itag", "bestvideo+bestaudio/best").trim();
        final String ext = sanitizeExt(call.getString("ext", "mp4"));
        final String rawFilename = call.getString("filename", "velosave_media");
        final String safeFilename = sanitizeOutputFilename(rawFilename, ext);

        cancelledTasks.remove(taskId);

        executor.execute(() -> {
            File workDir = new File(new File(getContext().getCacheDir(), "velosave_dl"), taskId);
            try {
                if (!workDir.exists() && !workDir.mkdirs()) {
                    throw new IOException("Could not create temporary download directory.");
                }

                File producedFile;
                if (!rawDirectUrl.isEmpty()) {
                    if (!isAllowedCdnUrl(rawDirectUrl)) {
                        call.reject("Blocked or unsupported CDN media URL.", "INVALID_URL");
                        return;
                    }
                    File destTemp = new File(workDir, safeFilename);
                    downloadDirectToFile(rawDirectUrl, destTemp, taskId);
                    producedFile = destTemp;
                } else {
                    MediaTarget target = null;
                    String safeQuery = "";
                    if (!rawQuery.isEmpty()) {
                        safeQuery = rawQuery.replaceAll("[\\r\\n]+", " ").trim();
                        if (safeQuery.length() > 180) {
                            safeQuery = safeQuery.substring(0, 180);
                        }
                    } else {
                        target = parseMediaTarget(rawUrl);
                        if (target == null) {
                            call.reject("Unsupported or invalid media link.", "INVALID_URL");
                            return;
                        }
                    }

                    ensureInitialized();
                    if (cancelledTasks.contains(taskId)) {
                        call.reject("Cancelled", "CANCELLED");
                        return;
                    }

                    String ytdlpTarget = !safeQuery.isEmpty()
                        ? "ytsearch1:" + safeQuery
                        : target.canonicalUrl;

                    YoutubeDLRequest request = new YoutubeDLRequest(ytdlpTarget);
                    request.addOption("--no-warnings");
                    request.addOption("--no-playlist");
                    request.addOption("-o", new File(workDir, "media.%(ext)s").getAbsolutePath());

                    if ("mp3".equals(ext)) {
                        request.addOption("-f", "bestaudio/best");
                        request.addOption("-x");
                        request.addOption("--audio-format", "mp3");
                        request.addOption("--audio-quality", "0");
                    } else if ("m4a".equals(ext)) {
                        request.addOption("-f", "bestaudio[ext=m4a]/bestaudio/best");
                        request.addOption("-x");
                        request.addOption("--audio-format", "m4a");
                    } else {
                        String safeSelector = FORMAT_SELECTOR_PATTERN.matcher(rawItag).matches()
                            ? rawItag
                            : "bestvideo+bestaudio/best";
                        request.addOption("-f", safeSelector);
                        request.addOption("--merge-output-format", "mp4");
                    }

                    final long[] lastEmitAt = new long[] { 0L };
                    Function3<Float, Long, String, Unit> progressCallback = (progress, etaInSeconds, line) -> {
                        long now = System.currentTimeMillis();
                        if (now - lastEmitAt[0] < 160L) {
                            return Unit.INSTANCE;
                        }
                        lastEmitAt[0] = now;
                        int pct;
                        if (progress == null || progress < 0f) {
                            pct = 94;
                        } else {
                            pct = Math.max(1, Math.min(95, Math.round(progress * 0.95f)));
                        }
                        emitProgress(taskId, pct, 0L, 0L);
                        return Unit.INSTANCE;
                    };

                    YoutubeDL.getInstance().execute(request, taskId, progressCallback);
                    if (cancelledTasks.contains(taskId)) {
                        call.reject("Cancelled", "CANCELLED");
                        return;
                    }

                    producedFile = findProducedFile(workDir, ext);
                    if (producedFile == null || !producedFile.exists() || producedFile.length() == 0L) {
                        throw new IOException("No output media file was generated by engine.");
                    }
                }

                if (cancelledTasks.contains(taskId)) {
                    call.reject("Cancelled", "CANCELLED");
                    return;
                }

                emitProgress(taskId, 98, producedFile.length(), producedFile.length());
                long fileSize = producedFile.length();
                String savedLocation = saveToPublicDownloads(producedFile, safeFilename, mimeTypeForExt(ext));
                emitProgress(taskId, 100, fileSize, fileSize);

                JSObject ret = new JSObject();
                ret.put("filename", safeFilename);
                ret.put("savedPath", savedLocation);
                ret.put("sizeBytes", fileSize);
                call.resolve(ret);
            } catch (YoutubeDL.CanceledException cancelled) {
                call.reject("Cancelled", "CANCELLED", cancelled);
            } catch (Exception e) {
                if (cancelledTasks.contains(taskId)) {
                    call.reject("Cancelled", "CANCELLED", e);
                } else {
                    call.reject(safeErrorMessage(e), "DOWNLOAD_FAILED", e);
                }
            } finally {
                cancelledTasks.remove(taskId);
                deleteRecursive(workDir);
            }
        });
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        String taskId = sanitizeTaskId(call.getString("taskId", ""));
        if (!taskId.isEmpty()) {
            cancelledTasks.add(taskId);
            YoutubeDL.getInstance().destroyProcessById(taskId);
        }
        JSObject ret = new JSObject();
        ret.put("cancelled", true);
        call.resolve(ret);
    }

    private void emitProgress(String taskId, int progress, long loadedBytes, long totalBytes) {
        JSObject payload = new JSObject();
        payload.put("taskId", taskId);
        payload.put("progress", progress);
        payload.put("loadedBytes", loadedBytes);
        payload.put("totalBytes", totalBytes);
        notifyListeners("downloadProgress", payload);
    }

    private JSObject inspectSingleViaYtDlp(MediaTarget target) throws Exception {
        YoutubeDLRequest request = new YoutubeDLRequest(target.canonicalUrl);
        request.addOption("--no-warnings");
        request.addOption("--no-playlist");
        request.addOption("-J");

        YoutubeDLResponse response = YoutubeDL.getInstance().execute(request, null, null);
        JSONObject info = new JSONObject(response.getOut());

        JSArray formats = new JSArray();
        JSONArray rawFormats = info.optJSONArray("formats");
        List<JSONObject> videoCandidates = new ArrayList<>();
        if (rawFormats != null) {
            for (int i = 0; i < rawFormats.length(); i++) {
                JSONObject f = rawFormats.optJSONObject(i);
                if (f == null) continue;
                String vcodec = f.optString("vcodec", "none");
                int height = f.optInt("height", 0);
                if (!"none".equals(vcodec) && !vcodec.isEmpty() && height > 0) {
                    videoCandidates.add(f);
                }
            }
        }
        Collections.sort(videoCandidates, (a, b) -> Integer.compare(b.optInt("height", 0), a.optInt("height", 0)));

        Set<Integer> preferredHeights = new HashSet<>(Arrays.asList(2160, 1440, 1080, 720, 480, 360));
        Set<Integer> seenHeights = new HashSet<>();
        for (JSONObject f : videoCandidates) {
            int h = f.optInt("height", 0);
            if (!preferredHeights.contains(h) && seenHeights.size() >= 4) continue;
            if (seenHeights.contains(h)) continue;
            seenHeights.add(h);

            JSObject fmt = new JSObject();
            fmt.put("id", "v-" + h + "p");
            fmt.put("kind", "video");
            fmt.put("label", h >= 1080 ? "Full HD Video" : h >= 720 ? "HD Video" : "Standard Video");
            fmt.put("quality", h + "p");
            fmt.put("container", "mp4");
            fmt.put("codec", "H.264 + AAC");
            long size = f.optLong("filesize", f.optLong("filesize_approx", 0L));
            if (size > 0L) {
                fmt.put("sizeBytes", size);
            }
            fmt.put("hasAudio", true);
            fmt.put("hasVideo", true);
            fmt.put("itag", "bestvideo[height<=" + h + "]+bestaudio/best[height<=" + h + "]");
            formats.put(fmt);
            if (seenHeights.size() >= 5) break;
        }

        if (formats.length() == 0) {
            JSObject best = new JSObject();
            best.put("id", "v-best");
            best.put("kind", "video");
            best.put("label", "Best Available Video");
            best.put("quality", "HD");
            best.put("container", "mp4");
            best.put("codec", "H.264 + AAC");
            best.put("hasAudio", true);
            best.put("hasVideo", true);
            best.put("itag", "bestvideo+bestaudio/best");
            formats.put(best);
        }

        JSObject mp3 = new JSObject();
        mp3.put("id", "a-mp3");
        mp3.put("kind", "audio");
        mp3.put("label", "MP3 Audio Track");
        mp3.put("quality", "320 kbps");
        mp3.put("container", "mp3");
        mp3.put("codec", "MP3");
        mp3.put("hasAudio", true);
        mp3.put("hasVideo", false);
        mp3.put("itag", "bestaudio");
        formats.put(mp3);

        JSObject m4a = new JSObject();
        m4a.put("id", "a-m4a");
        m4a.put("kind", "audio");
        m4a.put("label", "Audio Track");
        m4a.put("quality", "192 kbps");
        m4a.put("container", "m4a");
        m4a.put("codec", "AAC");
        m4a.put("hasAudio", true);
        m4a.put("hasVideo", false);
        m4a.put("itag", "bestaudio");
        formats.put(m4a);

        String thumb = info.optString("thumbnail", "");
        if (!thumb.isEmpty()) {
            JSObject cover = new JSObject();
            cover.put("id", "thumb-jpg");
            cover.put("kind", "thumbnail");
            cover.put("label", "Cover Image");
            cover.put("quality", "Original");
            cover.put("container", "jpg");
            cover.put("codec", "JPEG");
            cover.put("hasAudio", false);
            cover.put("hasVideo", false);
            cover.put("directUrl", thumb);
            formats.put(cover);
        }

        String author = info.optString("uploader", "");
        if (author.isEmpty()) {
            author = info.optString("channel", "");
        }
        if (author.isEmpty()) {
            author = "instagram".equals(target.platform) ? "@instagram" : "YouTube Creator";
        }

        JSObject media = new JSObject();
        media.put("id", info.optString("id", target.id));
        media.put("platform", target.platform);
        media.put("contentType", target.contentType);
        media.put("canonicalUrl", target.canonicalUrl);
        media.put("title", info.optString("title", "Media Video"));
        media.put("author", author);
        media.put("durationSeconds", Math.round(info.optDouble("duration", 0.0)));
        media.put("thumbnailUrl", thumb);
        media.put("formats", formats);
        return media;
    }

    private JSObject inspectYouTubePlaylist(MediaTarget target) throws Exception {
        YoutubeDLRequest request = new YoutubeDLRequest(target.canonicalUrl);
        request.addOption("--no-warnings");
        request.addOption("--flat-playlist");
        request.addOption("--playlist-end", "50");
        request.addOption("-J");

        YoutubeDLResponse response = YoutubeDL.getInstance().execute(request, null, null);
        JSONObject info = new JSONObject(response.getOut());
        JSONArray rawEntries = info.optJSONArray("entries");
        if (rawEntries == null || rawEntries.length() == 0) {
            throw new IOException("This YouTube playlist is empty or private.");
        }

        JSArray tracks = new JSArray();
        long totalDuration = 0L;
        String fallbackThumb = "";

        int idxCounter = 0;
        for (int i = 0; i < rawEntries.length(); i++) {
            JSONObject entry = rawEntries.optJSONObject(i);
            if (entry == null) continue;
            String vid = entry.optString("id", "");
            String entryRawUrl = entry.optString("url", "");
            if (vid.isEmpty() && entryRawUrl.isEmpty()) continue;

            idxCounter++;
            String entryThumb = extractLastThumbnail(entry.optJSONArray("thumbnails"));
            if (entryThumb.isEmpty() && !vid.isEmpty()) {
                entryThumb = "https://i.ytimg.com/vi/" + vid + "/hqdefault.jpg";
            }
            if (fallbackThumb.isEmpty() && !entryThumb.isEmpty()) {
                fallbackThumb = entryThumb;
            }

            String canonicalTrackUrl = !vid.isEmpty()
                ? "https://www.youtube.com/watch?v=" + vid
                : (entryRawUrl.startsWith("http") ? entryRawUrl : target.canonicalUrl);

            long dur = Math.round(entry.optDouble("duration", 0.0));
            totalDuration += dur;

            String uploader = entry.optString("uploader", "");
            if (uploader.isEmpty()) uploader = entry.optString("channel", "");
            if (uploader.isEmpty()) uploader = info.optString("uploader", "");
            if (uploader.isEmpty()) uploader = info.optString("channel", "YouTube Creator");

            JSObject tr = new JSObject();
            tr.put("id", !vid.isEmpty() ? vid : target.id + "-" + idxCounter);
            tr.put("index", idxCounter);
            tr.put("platform", "youtube");
            tr.put("title", entry.optString("title", "Video " + idxCounter));
            tr.put("author", uploader);
            tr.put("durationSeconds", dur);
            tr.put("thumbnailUrl", entryThumb);
            tr.put("canonicalUrl", canonicalTrackUrl);
            tracks.put(tr);
        }

        if (tracks.length() == 0) {
            throw new IOException("This YouTube playlist is empty or private.");
        }

        String playlistThumb = extractLastThumbnail(info.optJSONArray("thumbnails"));
        if (playlistThumb.isEmpty()) playlistThumb = fallbackThumb;

        String playlistAuthor = info.optString("uploader", "");
        if (playlistAuthor.isEmpty()) playlistAuthor = info.optString("channel", "YouTube Playlist");

        JSObject media = new JSObject();
        media.put("id", target.id);
        media.put("platform", "youtube");
        media.put("contentType", "playlist");
        media.put("canonicalUrl", target.canonicalUrl);
        media.put("title", info.optString("title", "YouTube Playlist"));
        media.put("author", playlistAuthor);
        media.put("durationSeconds", totalDuration);
        media.put("thumbnailUrl", playlistThumb);
        media.put("formats", buildPlaylistFormats(null));
        media.put("tracks", tracks);
        return media;
    }

    private JSObject inspectSpotifyPublicMetadata(MediaTarget target) throws Exception {
        String embedUrl = "https://open.spotify.com/embed/" + target.contentType + "/" + target.id;
        String html = httpGetString(embedUrl, 12000);

        Matcher m = NEXT_DATA_PATTERN.matcher(html);
        if (!m.find()) {
            throw new IOException("Could not read Spotify metadata. Ensure the link is public.");
        }

        JSONObject nextData = new JSONObject(m.group(1));
        JSONObject props = nextData.optJSONObject("props");
        JSONObject pageProps = props != null ? props.optJSONObject("pageProps") : null;
        JSONObject state = pageProps != null ? pageProps.optJSONObject("state") : null;
        JSONObject data = state != null ? state.optJSONObject("data") : null;
        JSONObject entity = data != null ? data.optJSONObject("entity") : null;

        if (entity == null || entity.optString("name", "").isEmpty()) {
            throw new IOException("Spotify item appears private or unavailable.");
        }

        String coverThumb = "";
        JSONObject coverArt = entity.optJSONObject("coverArt");
        if (coverArt != null) {
            coverThumb = extractFirstUrl(coverArt.optJSONArray("sources"));
        }
        if (coverThumb.isEmpty()) {
            JSONObject vi = entity.optJSONObject("visualIdentity");
            if (vi != null) {
                coverThumb = extractFirstUrl(vi.optJSONArray("image"));
            }
        }

        String entityName = entity.optString("name", "Spotify Media");
        String entitySubtitle = entity.optString("subtitle", "Spotify");

        if ("track".equals(target.contentType)) {
            StringBuilder artistBuilder = new StringBuilder();
            JSONArray artists = entity.optJSONArray("artists");
            if (artists != null) {
                for (int i = 0; i < artists.length(); i++) {
                    JSONObject art = artists.optJSONObject(i);
                    String name = art != null ? art.optString("name", "") : "";
                    if (!name.isEmpty()) {
                        if (artistBuilder.length() > 0) artistBuilder.append(", ");
                        artistBuilder.append(name);
                    }
                }
            }
            String artist = artistBuilder.length() > 0 ? artistBuilder.toString() : entitySubtitle;
            String searchQuery = artist + " - " + entityName + " audio";
            long durationSec = Math.round(entity.optDouble("duration", 0.0) / 1000.0);

            JSObject media = new JSObject();
            media.put("id", target.id);
            media.put("platform", "spotify");
            media.put("contentType", "track");
            media.put("canonicalUrl", target.canonicalUrl);
            media.put("title", entityName + " — " + artist);
            media.put("author", artist);
            media.put("durationSeconds", durationSec);
            media.put("thumbnailUrl", coverThumb);
            media.put("formats", buildPlaylistFormats(searchQuery));
            return media;
        }

        JSONArray rawTracks = entity.optJSONArray("trackList");
        if (rawTracks == null || rawTracks.length() == 0) {
            throw new IOException("No tracks were found in this Spotify playlist or album.");
        }

        JSArray tracks = new JSArray();
        long totalDuration = 0L;
        for (int i = 0; i < rawTracks.length(); i++) {
            JSONObject tr = rawTracks.optJSONObject(i);
            if (tr == null) continue;
            int index = i + 1;
            String trTitle = tr.optString("title", "Track " + index);
            String trArtist = tr.optString("subtitle", entitySubtitle);
            String uri = tr.optString("uri", "");
            String uriPart = tr.optString("uid", target.id + "-" + index);
            if (uri.contains(":")) {
                String[] parts = uri.split(":");
                if (parts.length > 0 && !parts[parts.length - 1].isEmpty()) {
                    uriPart = parts[parts.length - 1];
                }
            }
            long trDur = Math.round(tr.optDouble("duration", 0.0) / 1000.0);
            totalDuration += trDur;

            JSObject item = new JSObject();
            item.put("id", uriPart);
            item.put("index", index);
            item.put("platform", "spotify");
            item.put("title", trTitle);
            item.put("author", trArtist);
            item.put("durationSeconds", trDur);
            item.put("thumbnailUrl", coverThumb);
            item.put("canonicalUrl", uri.startsWith("spotify:track:")
                ? "https://open.spotify.com/track/" + uriPart
                : target.canonicalUrl);
            item.put("searchQuery", trArtist + " - " + trTitle + " audio");
            tracks.put(item);
        }

        JSObject media = new JSObject();
        media.put("id", target.id);
        media.put("platform", "spotify");
        media.put("contentType", target.contentType);
        media.put("canonicalUrl", target.canonicalUrl);
        media.put("title", entityName);
        media.put("author", entitySubtitle);
        media.put("durationSeconds", totalDuration);
        media.put("thumbnailUrl", coverThumb);
        media.put("formats", buildPlaylistFormats(null));
        media.put("tracks", tracks);
        return media;
    }

    private JSArray buildPlaylistFormats(String singleSearchQuery) {
        JSArray formats = new JSArray();
        formats.put(makeFormat("pl-1080", "video", "Full HD Video", "1080p", "mp4", "H.264 + AAC", true, true, "bestvideo[height<=1080]+bestaudio/best[height<=1080]", singleSearchQuery));
        formats.put(makeFormat("pl-720", "video", "HD Video", "720p", "mp4", "H.264 + AAC", true, true, "bestvideo[height<=720]+bestaudio/best[height<=720]", singleSearchQuery));
        formats.put(makeFormat("pl-360", "video", "Data Saver Video", "360p", "mp4", "H.264 + AAC", true, true, "bestvideo[height<=360]+bestaudio/best[height<=360]", singleSearchQuery));
        formats.put(makeFormat("pl-mp3", "audio", "MP3 Audio Track", "320 kbps", "mp3", "MP3", true, false, "bestaudio", singleSearchQuery));
        formats.put(makeFormat("pl-m4a", "audio", "M4A Audio Track", "192 kbps", "m4a", "AAC", true, false, "bestaudio", singleSearchQuery));
        return formats;
    }

    private JSObject makeFormat(
        String id,
        String kind,
        String label,
        String quality,
        String container,
        String codec,
        boolean hasAudio,
        boolean hasVideo,
        String itag,
        String searchQuery
    ) {
        JSObject obj = new JSObject();
        obj.put("id", id);
        obj.put("kind", kind);
        obj.put("label", label);
        obj.put("quality", quality);
        obj.put("container", container);
        obj.put("codec", codec);
        obj.put("hasAudio", hasAudio);
        obj.put("hasVideo", hasVideo);
        obj.put("itag", itag);
        if (searchQuery != null && !searchQuery.isEmpty()) {
            obj.put("searchQuery", searchQuery);
        }
        return obj;
    }

    private String saveToPublicDownloads(File sourceFile, String filename, String mimeType) throws IOException {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = ctx.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/VeloSave");
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                throw new IOException("Could not create destination entry in Android Downloads.");
            }
            try (InputStream in = new FileInputStream(sourceFile);
                 OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) {
                    throw new IOException("Failed to open Downloads output stream.");
                }
                copyStream(in, out);
                ContentValues doneValues = new ContentValues();
                doneValues.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(uri, doneValues, null, null);
                return "Downloads/VeloSave/" + filename;
            } catch (IOException e) {
                resolver.delete(uri, null, null);
                throw e;
            }
        }

        File targetDir = new File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            "VeloSave"
        );
        if (!targetDir.exists() && !targetDir.mkdirs()) {
            File fallbackRoot = ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            targetDir = new File(fallbackRoot != null ? fallbackRoot : ctx.getFilesDir(), "VeloSave");
            if (!targetDir.exists()) targetDir.mkdirs();
        }
        File destFile = uniqueTargetFile(targetDir, filename);
        try (InputStream in = new FileInputStream(sourceFile);
             OutputStream out = new FileOutputStream(destFile)) {
            copyStream(in, out);
        }
        MediaScannerConnection.scanFile(ctx, new String[] { destFile.getAbsolutePath() }, new String[] { mimeType }, null);
        return destFile.getAbsolutePath();
    }

    private File uniqueTargetFile(File dir, String filename) {
        File candidate = new File(dir, filename);
        if (!candidate.exists()) return candidate;
        int dot = filename.lastIndexOf('.');
        String base = dot > 0 ? filename.substring(0, dot) : filename;
        String ext = dot > 0 ? filename.substring(dot) : "";
        return new File(dir, base + "_" + System.currentTimeMillis() + ext);
    }

    private void downloadDirectToFile(String rawUrl, File destFile, String taskId) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(rawUrl).openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent", MOBILE_UA);
        conn.setConnectTimeout(12000);
        conn.setReadTimeout(20000);
        conn.setInstanceFollowRedirects(true);

        int status = conn.getResponseCode();
        if (status < 200 || status >= 300) {
            throw new IOException("Upstream server returned HTTP " + status);
        }

        long totalBytes = Math.max(0L, conn.getContentLengthLong());
        try (InputStream in = new BufferedInputStream(conn.getInputStream());
             OutputStream out = new FileOutputStream(destFile)) {
            byte[] buf = new byte[16384];
            long loaded = 0L;
            long lastEmit = 0L;
            int n;
            while ((n = in.read(buf)) != -1) {
                if (cancelledTasks.contains(taskId)) {
                    throw new IOException("Cancelled");
                }
                out.write(buf, 0, n);
                loaded += n;
                long now = System.currentTimeMillis();
                if (now - lastEmit > 150L) {
                    lastEmit = now;
                    int pct = totalBytes > 0
                        ? Math.min(95, (int) Math.round((loaded * 95.0) / totalBytes))
                        : Math.min(90, (int) (loaded / 16384L));
                    emitProgress(taskId, Math.max(1, pct), loaded, totalBytes > 0 ? totalBytes : loaded);
                }
            }
        } finally {
            conn.disconnect();
        }
    }

    private String httpGetString(String rawUrl, int timeoutMs) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(rawUrl).openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent", MOBILE_UA);
        conn.setConnectTimeout(timeoutMs);
        conn.setReadTimeout(timeoutMs);
        conn.setInstanceFollowRedirects(true);
        try {
            int status = conn.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IOException("Request failed with HTTP " + status);
            }
            try (InputStream in = new BufferedInputStream(conn.getInputStream());
                 ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
                copyStream(in, bos);
                return bos.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            conn.disconnect();
        }
    }

    private static void copyStream(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[16384];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
    }

    private File findProducedFile(File dir, String expectedExt) {
        File[] files = dir.listFiles();
        if (files == null || files.length == 0) return null;
        File best = null;
        for (File f : files) {
            if (!f.isFile()) continue;
            String name = f.getName().toLowerCase(Locale.US);
            if (name.endsWith(".part") || name.endsWith(".ytdl")) continue;
            if (name.endsWith("." + expectedExt)) return f;
            if (best == null || f.length() > best.length()) {
                best = f;
            }
        }
        return best;
    }

    private void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursive(child);
            }
        }
        file.delete();
    }

    private String extractLastThumbnail(JSONArray arr) {
        if (arr == null || arr.length() == 0) return "";
        for (int i = arr.length() - 1; i >= 0; i--) {
            JSONObject o = arr.optJSONObject(i);
            String u = o != null ? o.optString("url", "") : "";
            if (!u.isEmpty()) return u;
        }
        return "";
    }

    private String extractFirstUrl(JSONArray arr) {
        if (arr == null || arr.length() == 0) return "";
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            String u = o != null ? o.optString("url", "") : "";
            if (!u.isEmpty()) return u;
        }
        return "";
    }

    private boolean isAllowedCdnUrl(String rawUrl) {
        try {
            URI uri = URI.create(rawUrl);
            String scheme = uri.getScheme();
            if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
                return false;
            }
            String host = uri.getHost();
            if (host == null) return false;
            String lower = host.toLowerCase(Locale.US);
            for (String suffix : ALLOWED_CDN_SUFFIXES) {
                if (lower.equals(suffix.substring(1)) || lower.endsWith(suffix)) {
                    return true;
                }
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private static class MediaTarget {
        final String platform;
        final String id;
        final String canonicalUrl;
        final String contentType;
        final String playlistUrl;

        MediaTarget(String platform, String id, String canonicalUrl, String contentType, String playlistUrl) {
            this.platform = platform;
            this.id = id;
            this.canonicalUrl = canonicalUrl;
            this.contentType = contentType;
            this.playlistUrl = playlistUrl;
        }
    }

    private MediaTarget parseMediaTarget(String rawInput) {
        if (rawInput == null || rawInput.trim().isEmpty()) return null;
        String normalized = rawInput.trim();
        if (!normalized.matches("^[a-zA-Z][a-zA-Z0-9+.-]*:.*")) {
            normalized = "https://" + normalized;
        }

        Uri uri;
        try {
            uri = Uri.parse(normalized);
        } catch (Exception e) {
            return null;
        }

        String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
            return null;
        }
        String host = uri.getHost();
        if (host == null) return null;
        String lowerHost = host.toLowerCase(Locale.US);
        List<String> segments = uri.getPathSegments();

        if (YOUTUBE_HOSTS.contains(lowerHost)) {
            String listParam = uri.getQueryParameter("list");
            boolean hasValidList = listParam != null && YT_LIST_PATTERN.matcher(listParam).matches();
            if (!segments.isEmpty() && "playlist".equals(segments.get(0)) && hasValidList) {
                return new MediaTarget(
                    "youtube",
                    listParam,
                    "https://www.youtube.com/playlist?list=" + listParam,
                    "playlist",
                    null
                );
            }

            String videoId = null;
            String type = "video";
            if ("youtu.be".equals(lowerHost)) {
                if (!segments.isEmpty() && YT_ID_PATTERN.matcher(segments.get(0)).matches()) {
                    videoId = segments.get(0);
                }
            } else {
                String vParam = uri.getQueryParameter("v");
                if (vParam != null && YT_ID_PATTERN.matcher(vParam).matches()) {
                    videoId = vParam;
                } else if (segments.size() >= 2) {
                    String prefix = segments.get(0);
                    if ("shorts".equals(prefix) || "embed".equals(prefix) || "live".equals(prefix) || "v".equals(prefix)) {
                        if (YT_ID_PATTERN.matcher(segments.get(1)).matches()) {
                            videoId = segments.get(1);
                            type = "shorts".equals(prefix) ? "short" : "video";
                        }
                    }
                }
            }

            if (videoId == null) {
                if (hasValidList) {
                    return new MediaTarget(
                        "youtube",
                        listParam,
                        "https://www.youtube.com/playlist?list=" + listParam,
                        "playlist",
                        null
                    );
                }
                return null;
            }

            String canonical = "short".equals(type)
                ? "https://www.youtube.com/shorts/" + videoId
                : "https://www.youtube.com/watch?v=" + videoId;
            String playlistUrl = hasValidList && listParam.length() >= 10
                ? "https://www.youtube.com/playlist?list=" + listParam
                : null;
            return new MediaTarget("youtube", videoId, canonical, type, playlistUrl);
        }

        if (INSTAGRAM_HOSTS.contains(lowerHost)) {
            String code = null;
            String type = "reel";
            if (segments.size() >= 2) {
                String p0 = segments.get(0);
                if ("reel".equals(p0) || "reels".equals(p0) || "p".equals(p0) || "tv".equals(p0)) {
                    if (IG_CODE_PATTERN.matcher(segments.get(1)).matches()) {
                        code = segments.get(1);
                        type = "p".equals(p0) ? "post" : "reel";
                    }
                }
            }
            if (code == null && segments.size() >= 3) {
                String p1 = segments.get(1);
                if ("reel".equals(p1) || "p".equals(p1)) {
                    if (IG_CODE_PATTERN.matcher(segments.get(2)).matches()) {
                        code = segments.get(2);
                        type = "p".equals(p1) ? "post" : "reel";
                    }
                }
            }
            if (code == null) return null;
            String seg = "post".equals(type) ? "p" : "reel";
            return new MediaTarget(
                "instagram",
                code,
                "https://www.instagram.com/" + seg + "/" + code + "/",
                type,
                null
            );
        }

        if (SPOTIFY_HOSTS.contains(lowerHost)) {
            int offset = !segments.isEmpty() && segments.get(0).startsWith("intl-") ? 1 : 0;
            if (segments.size() >= offset + 2) {
                String kind = segments.get(offset);
                String spId = segments.get(offset + 1);
                if (("playlist".equals(kind) || "album".equals(kind) || "track".equals(kind))
                    && SPOTIFY_ID_PATTERN.matcher(spId).matches()) {
                    return new MediaTarget(
                        "spotify",
                        spId,
                        "https://open.spotify.com/" + kind + "/" + spId,
                        kind,
                        null
                    );
                }
            }
            return null;
        }

        return null;
    }

    private String sanitizeTaskId(String raw) {
        String clean = raw == null ? "" : raw.replaceAll("[^a-zA-Z0-9_-]", "");
        return clean.isEmpty() ? "task_" + System.currentTimeMillis() : clean.substring(0, Math.min(clean.length(), 48));
    }

    private String sanitizeExt(String raw) {
        String clean = raw == null ? "mp4" : raw.replaceAll("[^a-zA-Z0-9]", "").toLowerCase(Locale.US);
        if ("mp3".equals(clean) || "m4a".equals(clean) || "webm".equals(clean) || "jpg".equals(clean)) {
            return clean;
        }
        return "mp4";
    }

    private String sanitizeOutputFilename(String rawName, String ext) {
        String stripped = rawName == null ? "" : rawName.replaceAll("\\.[a-zA-Z0-9]+$", "");
        String cleanBase = stripped
            .replaceAll("[^\\w\\s-]", "")
            .trim()
            .replaceAll("\\s+", "_");
        if (cleanBase.length() > 56) {
            cleanBase = cleanBase.substring(0, 56);
        }
        if (cleanBase.isEmpty()) {
            cleanBase = "velosave_media";
        }
        return cleanBase + "." + ext;
    }

    private String mimeTypeForExt(String ext) {
        switch (ext) {
            case "mp3":
                return "audio/mpeg";
            case "m4a":
                return "audio/mp4";
            case "jpg":
                return "image/jpeg";
            case "webm":
                return "video/webm";
            default:
                return "video/mp4";
        }
    }

    private String safeErrorMessage(Exception e) {
        String msg = e.getMessage();
        if (msg == null || msg.trim().isEmpty()) {
            return "Engine error while processing media.";
        }
        String[] lines = msg.split("\\r?\\n");
        for (String line : lines) {
            if (line.trim().startsWith("ERROR:")) {
                return line.trim().substring(6).trim();
            }
        }
        return msg.length() > 240 ? msg.substring(0, 240) : msg;
    }
}
