import { useState, useEffect, useCallback } from "react";
import { KeyRound, Eye, EyeOff, X } from "lucide-react";
import apiClient, { getApiErrorMessage } from "../services/apiClient";
import { Button, Alert } from "../components/ui";

export default function ChangePasswordModal({ isOpen, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Reset form state when modal closes
  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setIsSubmitting(false);
    setError(null);
    setSuccess(null);
  };

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }, [isSubmitting, onClose]);

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        handleClose();
      }
    }

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, isSubmitting, handleClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setSuccess(null);

    // Client-side validations
    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }

    if (!newPassword) {
      setError("Please enter your new password.");
      return;
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      setError("New password must be between 8 and 128 characters.");
      return;
    }

    if (!confirmPassword) {
      setError("Please confirm your new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Execute request against backend change-password endpoint
      await apiClient.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });

      setSuccess("Your password has been updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Automatically dismiss after brief success display
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      if (err.response?.status === 404) {
        setError(
          "Password change service is not currently supported by the campus backend server. Please contact your system administrator."
        );
      } else {
        setError(
          getApiErrorMessage(
            err,
            "Failed to change password. Please verify your current password and try again."
          )
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#3C1414]/30 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleClose();
        }
      }}
    >
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#E5D6D6] bg-white p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E5D6D6] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B26262]/10 text-[#B26262]">
              <KeyRound size={20} />
            </div>
            <div>
              <h3
                id="change-password-dialog-title"
                className="text-base font-bold text-[#3C1414]"
              >
                Change Password
              </h3>
              <p className="text-xs text-[#806B6A]">
                Update your campus account password
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label="Close change password dialog"
            className="rounded-lg p-1.5 text-[#806B6A] hover:bg-[#F0E3E3] hover:text-[#3C1414] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mt-4">
            <Alert variant="danger" onClose={() => setError(null)}>
              {error}
            </Alert>
          </div>
        )}

        {success && (
          <div className="mt-4">
            <Alert variant="success">{success}</Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          <div>
            <label
              htmlFor="current-password-input"
              className="block font-medium text-[#3C1414]"
            >
              Current Password
            </label>
            <div className="relative mt-1">
              <input
                id="current-password-input"
                name="currentPassword"
                type={showCurrent ? "text" : "password"}
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter your existing password"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] py-2 pl-3 pr-10 text-xs text-[#3C1414] focus:border-[#B26262] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                aria-label={showCurrent ? "Hide current password" : "Show current password"}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#806B6A] hover:text-[#3C1414]"
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="new-password-input"
              className="block font-medium text-[#3C1414]"
            >
              New Password
            </label>
            <div className="relative mt-1">
              <input
                id="new-password-input"
                name="newPassword"
                type={showNew ? "text" : "password"}
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Must be at least 8 characters"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] py-2 pl-3 pr-10 text-xs text-[#3C1414] focus:border-[#B26262] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20"
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                aria-label={showNew ? "Hide new password" : "Show new password"}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#806B6A] hover:text-[#3C1414]"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-[#806B6A]">
              Must be between 8 and 128 characters.
            </p>
          </div>

          <div>
            <label
              htmlFor="confirm-password-input"
              className="block font-medium text-[#3C1414]"
            >
              Confirm New Password
            </label>
            <div className="relative mt-1">
              <input
                id="confirm-password-input"
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Re-enter your new password"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] py-2 pl-3 pr-10 text-xs text-[#3C1414] focus:border-[#B26262] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#806B6A] hover:text-[#3C1414]"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              Update Password
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
