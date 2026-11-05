import { useState, useEffect } from "react";
import {
  X,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Wifi,
  ShieldCheck,
  Radio,
  ToggleLeft,
  ToggleRight,
  Settings,
  Trash2,
  Lock,
} from "lucide-react";
import { cameraApi } from "../../services/campusApi";
import { Button } from "../../components/ui";

export default function RegisterCameraModal({
  isOpen,
  onClose,
  onRegistered,
  onDeleted,
  canManage = true,
  cameraToEdit = null,
}) {
  const isEditing = Boolean(cameraToEdit);

  const [formData, setFormData] = useState({
    name: "",
    cameraId: "",
    cameraType: "ip_camera",
    streamType: "mjpeg",
    streamUrl: "",
    previewUrl: "",
    location: "",
    building: "",
    isActive: true,
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => {
    if (cameraToEdit) {
      setFormData({
        name: cameraToEdit.name || "",
        cameraId: cameraToEdit.cameraId || "",
        cameraType: cameraToEdit.cameraType || "ip_camera",
        streamType: cameraToEdit.streamType || "mjpeg",
        streamUrl: cameraToEdit.streamUrl || "",
        previewUrl: cameraToEdit.previewUrl || "",
        location: cameraToEdit.location || "",
        building: cameraToEdit.building || "",
        isActive: cameraToEdit.isActive !== false,
      });
      setShowGuide(false);
    } else {
      setFormData({
        name: "",
        cameraId: "",
        cameraType: "ip_camera",
        streamType: "mjpeg",
        streamUrl: "",
        previewUrl: "",
        location: "",
        building: "",
        isActive: true,
      });
      setShowGuide(true);
    }
    setTestResult(null);
    setSubmitError(null);
  }, [cameraToEdit, isOpen]);

  if (!isOpen) return null;

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTestResult(null);
    setSubmitError(null);
  };

  const isBaseStreamUrl = (url) => {
    if (!url || typeof url !== "string") return false;
    try {
      const trimmed = url.trim();
      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return false;
      const parsed = new URL(trimmed);
      return parsed.pathname === "" || parsed.pathname === "/";
    } catch {
      return false;
    }
  };

  const handleAppendVideo = () => {
    try {
      const parsed = new URL(formData.streamUrl.trim());
      parsed.pathname = "/video";
      const newStreamUrl = parsed.toString();
      setFormData((prev) => ({
        ...prev,
        streamUrl: newStreamUrl,
        previewUrl: prev.previewUrl || `${parsed.origin}/shot.jpg`,
      }));
      setTestResult(null);
    } catch {
      const cleaned = formData.streamUrl.trim().replace(/\/+$/, "");
      setFormData((prev) => ({
        ...prev,
        streamUrl: `${cleaned}/video`,
        previewUrl: prev.previewUrl || `${cleaned}/shot.jpg`,
      }));
      setTestResult(null);
    }
  };

  const handleApplySuggestedUrl = (suggestedUrl) => {
    if (!suggestedUrl) return;
    setFormData((prev) => ({
      ...prev,
      streamUrl: suggestedUrl,
      previewUrl: prev.previewUrl || suggestedUrl.replace(/\/video$/, "/shot.jpg"),
    }));
    setTestResult(null);
  };

  const handleTestStream = async () => {
    const rawUrl = formData.streamUrl.trim();
    if (!rawUrl) {
      setTestResult({
        reachable: false,
        code: "URL_EMPTY",
        error: "Please enter a stream URL first (e.g., http://10.112.164.88:8080/video).",
        action: "Enter the IP address shown in IP Webcam followed by /video.",
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await cameraApi.verifyStream(rawUrl);
      setTestResult(res);
    } catch (err) {
      setTestResult({
        reachable: false,
        code: err.response?.data?.code || "TEST_FAILED",
        error:
          err.response?.data?.message ||
          "Could not reach stream. Ensure phone camera server is running and computer is on the same Wi-Fi.",
        action:
          err.response?.data?.action ||
          "Make sure your phone has IP Webcam open with 'Start server' pressed, and both devices are on the same Wi-Fi.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.cameraId.trim() || !formData.location.trim()) {
      setSubmitError("Please fill in Camera Name, Camera ID, and Campus Location.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        name: formData.name.trim(),
        cameraId: formData.cameraId.trim(),
        cameraType: formData.cameraType,
        location: formData.location.trim(),
        building: formData.building.trim(),
        streamType: formData.streamType,
        streamUrl: formData.streamUrl.trim(),
        previewUrl: formData.previewUrl.trim() || formData.streamUrl.trim(),
        isActive: Boolean(formData.isActive),
        // Only set status to online if testResult verified reachability; else default offline
        status: testResult?.reachable ? "online" : isEditing ? cameraToEdit.status : "offline",
      };

      const editId = cameraToEdit?._id || cameraToEdit?.id;
      if (isEditing && editId) {
        await cameraApi.update(editId, payload);
      } else {
        await cameraApi.create(payload);
      }

      onRegistered?.();
      onClose();
    } catch (err) {
      const fieldError = err.response?.data?.errors?.[0]?.msg;
      const serverMsg = err.response?.data?.message;
      setSubmitError(
        fieldError ||
          serverMsg ||
          "Failed to save camera. Check duplicate camera ID or permissions."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-camera-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#3C1414]/30 backdrop-blur-sm animate-fade-in overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl max-h-[90dvh] my-4 sm:my-8 rounded-2xl bg-white border border-[#E5D6D6] shadow-2xl overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5D6D6] bg-[#F6EDED]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B26262]/10 text-[#B26262]">
              {isEditing ? <Settings size={22} /> : <Smartphone size={22} />}
            </div>
            <div>
              <h2 id="register-camera-title" className="text-base font-bold text-[#3C1414]">
                {isEditing ? "Edit Camera Configuration" : "Register Camera / Connect Android IP Camera"}
              </h2>
              <p className="text-xs text-[#806B6A]">
                {isEditing
                  ? "Update camera stream URL, IP address endpoint, or physical location"
                  : "Connect your real Android phone camera stream over local Wi-Fi to the CCTV network"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#806B6A] hover:bg-[#F0E3E3] hover:text-[#3C1414] transition"
            aria-label="Close registration dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Setup Instructions Box */}
        <div className="px-6 pt-4">
          <div className="rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[#3C1414]">
                <HelpCircle size={15} className="text-[#B26262]" />
                <span>How to obtain and enter your Android phone&apos;s IP Camera URL</span>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="text-[11px] font-semibold text-[#B26262] hover:underline"
              >
                {showGuide ? "Hide instructions" : "Show instructions"}
              </button>
            </div>

            {showGuide && (
              <ol className="mt-3 space-y-1.5 text-xs text-[#806B6A] list-decimal list-inside leading-relaxed">
                <li>
                  <strong className="text-[#3C1414]">Install Camera App on Android:</strong> Install <em>IP Webcam</em> (free by Pavel Khlebovich) from Google Play Store. (Or <em>DroidCam</em> / <em>IP Camera Lite</em>).
                </li>
                <li>Connect your Android phone and computer to the <strong className="text-[#3C1414]">same Wi-Fi network</strong> (or mobile hotspot).</li>
                <li>In IP Webcam, scroll to the bottom and tap <strong className="text-[#3C1414]">&ldquo;Start server&rdquo;</strong>.</li>
                <li>
                  Read the IP address displayed at the bottom of the camera screen (e.g., <code className="bg-white px-1 py-0.5 rounded border border-[#E5D6D6] font-mono text-[11px] text-[#3C1414]">http://192.168.1.50:8080</code>).
                  <div className="mt-1 text-[11px] text-[#A66A00] font-medium">
                    ⚠️ <strong>Important:</strong> Do not enter <code className="font-mono">localhost</code> or <code className="font-mono">127.0.0.1</code>. Localhost refers to this computer, not your phone. Enter the phone's actual Wi-Fi IP address.
                  </div>
                </li>
                <li>
                  <strong className="text-[#3C1414]">Stream Endpoint Format:</strong> Append <code className="bg-white px-1 py-0.5 rounded border border-[#E5D6D6] font-mono text-[11px] text-[#3C1414]">/video</code> for the live MJPEG stream:
                  <div className="mt-1 pl-4 font-mono text-[11px] text-[#B26262]">
                    Stream URL: <strong>http://&lt;your-phone-ip&gt;:8080/video</strong>
                  </div>
                  <div className="pl-4 font-mono text-[10px] text-[#806B6A]">
                    Snapshot URL (optional): http://&lt;your-phone-ip&gt;:8080/shot.jpg
                  </div>
                </li>
                <li>
                  Click <strong className="text-[#3C1414]">&ldquo;Test Connection&rdquo;</strong> below to verify genuine reachability before saving.
                </li>
              </ol>
            )}
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-[#3C1414] mb-1">
                Camera Name <span className="text-[#C62828]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Android Phone Camera"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                required
                className="w-full rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] px-3.5 py-2 text-sm text-[#3C1414] placeholder-[#806B6A] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 focus:border-[#B26262]"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-[#3C1414] mb-1">
                Camera ID <span className="text-[#C62828]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., CAM-PHONE-01"
                value={formData.cameraId}
                onChange={(e) => handleInputChange("cameraId", e.target.value)}
                required
                disabled={isEditing}
                className="w-full rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] px-3.5 py-2 text-sm text-[#3C1414] placeholder-[#806B6A] font-mono focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 focus:border-[#B26262] disabled:opacity-60"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-[#3C1414] mb-1">
                Camera Type
              </label>
              <select
                value={formData.cameraType}
                onChange={(e) => handleInputChange("cameraType", e.target.value)}
                className="w-full rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] px-3 py-2 text-sm text-[#3C1414] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 focus:border-[#B26262]"
              >
                <option value="ip_camera">IP Camera (Smartphone / Network Camera)</option>
                <option value="cctv_rtsp">CCTV RTSP Node</option>
                <option value="fixed_dome">Fixed Dome / Bullet Camera</option>
                <option value="ptz">PTZ Surveillance Camera</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#3C1414] mb-1">
                Campus Zone or Location <span className="text-[#C62828]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Main Quad / Library Desk"
                value={formData.location}
                onChange={(e) => handleInputChange("location", e.target.value)}
                required
                className="w-full rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] px-3.5 py-2 text-sm text-[#3C1414] placeholder-[#806B6A] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 focus:border-[#B26262]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#3C1414] mb-1">
                Department or Building Assignment
              </label>
              <input
                type="text"
                placeholder="e.g., Academic Block A"
                value={formData.building}
                onChange={(e) => handleInputChange("building", e.target.value)}
                className="w-full rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] px-3.5 py-2 text-sm text-[#3C1414] placeholder-[#806B6A] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 focus:border-[#B26262]"
              />
            </div>
          </div>

          {/* Stream Configuration & Protocol */}
          <div className="p-4 rounded-xl border border-[#E5D6D6] bg-[#F6EDED]/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#3C1414] flex items-center gap-1.5">
                <Radio size={14} className="text-[#B26262]" />
                Live Stream Endpoint (Enter Phone IP Address Here)
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#806B6A]">Protocol:</span>
                <select
                  value={formData.streamType}
                  onChange={(e) => handleInputChange("streamType", e.target.value)}
                  className="rounded-lg border border-[#E5D6D6] bg-white px-2 py-1 text-xs font-medium text-[#3C1414] focus:outline-none"
                >
                  <option value="mjpeg">HTTP MJPEG (Phone app default - Recommended)</option>
                  <option value="hls">HLS (.m3u8)</option>
                  <option value="rtsp">RTSP (requires gateway)</option>
                  <option value="mp4">MP4 / WebM HTTP Stream</option>
                  <option value="auto">Auto Detect</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#806B6A] mb-1">
                Stream URL (IP Address &amp; Path) <span className="text-[#C62828]">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="e.g., http://10.112.164.88:8080/video"
                  value={formData.streamUrl}
                  onChange={(e) => handleInputChange("streamUrl", e.target.value)}
                  required
                  className="flex-1 rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] px-3.5 py-2 text-xs font-mono text-[#3C1414] placeholder-[#806B6A] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 focus:border-[#B26262]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestStream}
                  loading={testing}
                  disabled={testing}
                  icon={Wifi}
                  className="shrink-0"
                >
                  Test Connection
                </Button>
              </div>

              {/* In-place warning and 1-click fix when user enters base URL without /video */}
              {isBaseStreamUrl(formData.streamUrl) && (
                <div className="mt-2 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertCircle size={15} className="shrink-0 text-amber-500" />
                    <span className="truncate">
                      Missing stream path. Android IP Webcam requires <code className="font-mono font-bold">/video</code> at the end.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAppendVideo}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-950 dark:text-amber-100 font-bold text-[11px] shrink-0 transition"
                  >
                    + Append /video
                  </button>
                </div>
              )}

              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Replace with the actual IP address shown on your Android phone screen. Must include <code className="font-mono">/video</code> at the end (e.g., <code className="font-mono">http://10.112.164.88:8080/video</code>).
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Preview / Snapshot URL <span className="text-slate-400">(optional, for static snapshots)</span>
              </label>
              <input
                type="url"
                placeholder="e.g., http://10.112.164.88:8080/shot.jpg"
                value={formData.previewUrl}
                onChange={(e) => handleInputChange("previewUrl", e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {/* Test Result Feedback (Authentic Connectivity Verification) */}
            {testResult && (
              <div
                className={`rounded-xl p-3.5 text-xs transition-all space-y-2.5 ${
                  testResult.reachable
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
                    : "bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 border border-red-200 dark:border-red-800"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {testResult.reachable ? (
                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">
                          {testResult.reachable ? "Live Stream Verified!" : "Stream Unreachable"}
                        </span>
                        {testResult.code && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              testResult.reachable
                                ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                                : "bg-red-500/20 text-red-800 dark:text-red-300"
                            }`}
                          >
                            {testResult.code}
                          </span>
                        )}
                      </div>
                      {testResult.latencyMs !== undefined && (
                        <span className="text-[11px] font-mono opacity-75">
                          Latency: {testResult.latencyMs}ms
                        </span>
                      )}
                    </div>

                    <p className="text-xs leading-relaxed opacity-95">
                      {testResult.error ||
                        testResult.message ||
                        (testResult.reachable
                          ? `Camera stream reached (${testResult.contentType || "active feed"}). Status will be set to ONLINE upon saving.`
                          : "Could not establish stream connection.")}
                    </p>
                  </div>
                </div>

                {/* Suggested Action Box */}
                {testResult.action && (
                  <div className="p-2.5 rounded-lg bg-[#F6EDED] border border-[#E5D6D6] text-xs">
                    <span className="font-bold text-[10px] uppercase tracking-wider block mb-1 text-[#806B6A]">
                      Recommended Action:
                    </span>
                    <p className="whitespace-pre-line text-[#3C1414] font-medium">
                      {testResult.action}
                    </p>
                  </div>
                )}

                {/* 1-Click suggested URL fix */}
                {testResult.suggestedUrl && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#F6EDED] border border-[#E5D6D6] text-xs">
                    <div className="text-[11px] text-[#3C1414] truncate">
                      Suggested Stream URL: <code className="font-mono font-bold text-[#B26262]">{testResult.suggestedUrl}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplySuggestedUrl(testResult.suggestedUrl)}
                      className="px-2.5 py-1 rounded-md bg-[#B26262] hover:bg-[#9E5252] text-white font-semibold text-[11px] shrink-0 transition"
                    >
                      Use This URL
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Enabled / Disabled Status Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#E5D6D6] bg-white">
            <div>
              <p className="text-xs font-semibold text-[#3C1414]">
                Camera Monitoring Status
              </p>
              <p className="text-[11px] text-[#806B6A]">
                {formData.isActive
                  ? "Camera is enabled and actively available in the monitoring grid"
                  : "Camera is disabled and paused from active surveillance"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleInputChange("isActive", !formData.isActive)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5D6D6] text-xs font-medium transition hover:bg-[#F0E3E3]"
            >
              {formData.isActive ? (
                <>
                  <ToggleRight size={18} className="text-[#287A43]" />
                  <span className="text-[#287A43] font-semibold">Enabled</span>
                </>
              ) : (
                <>
                  <ToggleLeft size={18} className="text-[#806B6A]" />
                  <span className="text-[#806B6A]">Disabled</span>
                </>
              )}
            </button>
          </div>

          {/* Permission Denied Warning if unauthorized role opens modal */}
          {!canManage && (
            <div className="flex items-center gap-2 rounded-xl bg-[#FFF4CC] border border-[#A66A00]/30 p-3 text-xs text-[#A66A00] font-medium">
              <Lock size={16} className="shrink-0 text-[#A66A00]" />
              <span>Permission Denied: Camera registration, configuration, and deletion are strictly restricted to SUPER_ADMIN and SECURITY roles.</span>
            </div>
          )}

          {submitError && (
            <div className="flex items-center gap-2 rounded-xl bg-[#FDECEC] border border-[#C62828]/30 p-3 text-xs text-[#C62828]">
              <AlertCircle size={16} className="shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#E5D6D6]">
            <div>
              {isEditing && canManage && (
                <Button
                  type="button"
                  variant="danger"
                  loading={deleting}
                  icon={Trash2}
                  onClick={async () => {
                    if (!window.confirm(`Permanently unregister camera "${cameraToEdit.name || cameraToEdit.cameraId}"?`)) {
                      return;
                    }
                    setDeleting(true);
                    setSubmitError(null);
                    try {
                      await cameraApi.delete(cameraToEdit._id);
                      onDeleted?.();
                      onClose();
                    } catch (err) {
                      setSubmitError(err.response?.data?.message || "Failed to delete camera.");
                    } finally {
                      setDeleting(false);
                    }
                  }}
                >
                  Delete Camera
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={!canManage}
                icon={ShieldCheck}
              >
                {isEditing ? "Save Changes" : "Save Camera"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
