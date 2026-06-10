"""
BioFusion AI — Signal Processing Pipeline
ECG, EMG, EEG signal processing functions
"""
import numpy as np
from scipy.signal import (
    butter, filtfilt, find_peaks, welch, decimate,
    hilbert, iirnotch
)
from scipy.stats import entropy as scipy_entropy


# ──────────────────────────────────────────────
# COMMON UTILITIES
# ──────────────────────────────────────────────

def bandpass_filter(signal, lowcut, highcut, fs, order=4):
    nyq = 0.5 * fs
    low = max(lowcut / nyq, 0.001)
    high = min(highcut / nyq, 0.999)
    b, a = butter(order, [low, high], btype='band')
    return filtfilt(b, a, signal)


def notch_filter(signal, freq, fs, Q=30):
    nyq = 0.5 * fs
    if freq >= nyq:
        return signal
    b, a = iirnotch(freq, Q, fs)
    return filtfilt(b, a, signal)


def normalize_signal(signal):
    s = signal - np.mean(signal)
    std = np.std(s)
    if std > 0:
        s = s / std
    return s


# ──────────────────────────────────────────────
# ECG PROCESSING
# ──────────────────────────────────────────────

def process_ecg(signal, fs=360):
    """Full ECG processing pipeline."""
    sig = np.array(signal, dtype=np.float64)
    sig = sig - np.mean(sig)

    # Bandpass 0.5 – 45 Hz
    filtered = bandpass_filter(sig, 0.5, 45.0, fs, order=4)
    # Notch 50 Hz powerline
    filtered = notch_filter(filtered, 50.0, fs)

    # Pan-Tompkins-style R-peak detection
    r_peaks = detect_r_peaks(filtered, fs)

    # RR intervals
    rr_intervals = np.diff(r_peaks) / fs * 1000  # ms

    # Features
    features = compute_ecg_features(rr_intervals, filtered, r_peaks, fs)

    # HRV frequency domain
    hrv_spectrum = compute_hrv_spectrum(rr_intervals, fs)

    # Poincaré
    poincare = compute_poincare(rr_intervals)

    # Signal quality
    quality = compute_ecg_quality(filtered, r_peaks, fs)

    return {
        "filtered_signal": filtered.tolist(),
        "r_peaks": r_peaks.tolist(),
        "rr_intervals": rr_intervals.tolist(),
        "features": features,
        "hrv_spectrum": hrv_spectrum,
        "poincare": poincare,
        "signal_quality": quality,
    }


def detect_r_peaks(signal, fs):
    """Simplified Pan-Tompkins R-peak detector."""
    # Derivative
    diff_sig = np.diff(signal)
    # Square
    squared = diff_sig ** 2
    # Moving average window
    win_size = int(0.15 * fs)
    if win_size < 1:
        win_size = 1
    kernel = np.ones(win_size) / win_size
    integrated = np.convolve(squared, kernel, mode='same')

    # Find peaks with minimum distance
    min_distance = int(0.3 * fs)  # 200 BPM max
    height_threshold = np.mean(integrated) + 0.3 * np.std(integrated)
    peaks, _ = find_peaks(
        integrated,
        distance=min_distance,
        height=height_threshold,
    )

    # Refine: find actual max in original signal around each peak
    refined = []
    search_window = int(0.05 * fs)
    for p in peaks:
        lo = max(0, p - search_window)
        hi = min(len(signal), p + search_window + 1)
        local_max = lo + np.argmax(signal[lo:hi])
        refined.append(local_max)

    return np.array(refined, dtype=int)


def compute_ecg_features(rr_intervals, signal, peaks, fs):
    """Compute comprehensive ECG features."""
    if len(rr_intervals) < 2:
        return {
            "hr_bpm": 0, "mean_rr": 0, "std_rr": 0,
            "rmssd": 0, "pnn50": 0, "qrs_width": 0,
        }

    mean_rr = float(np.mean(rr_intervals))
    std_rr = float(np.std(rr_intervals))
    hr_bpm = 60000.0 / mean_rr if mean_rr > 0 else 0

    # RMSSD
    diffs = np.diff(rr_intervals)
    rmssd = float(np.sqrt(np.mean(diffs ** 2))) if len(diffs) > 0 else 0

    # pNN50
    pnn50 = float(np.sum(np.abs(diffs) > 50) / len(diffs) * 100) if len(diffs) > 0 else 0

    # QRS width estimate (ms)
    qrs_widths = []
    for p in peaks:
        lo = max(0, p - int(0.06 * fs))
        hi = min(len(signal), p + int(0.06 * fs))
        segment = signal[lo:hi]
        threshold = 0.3 * np.max(np.abs(segment))
        above = np.where(np.abs(segment) > threshold)[0]
        if len(above) > 1:
            qrs_widths.append((above[-1] - above[0]) / fs * 1000)
    qrs_width = float(np.mean(qrs_widths)) if qrs_widths else 80.0

    return {
        "hr_bpm": round(hr_bpm, 1),
        "mean_rr": round(mean_rr, 1),
        "std_rr": round(std_rr, 1),
        "rmssd": round(rmssd, 1),
        "pnn50": round(pnn50, 1),
        "qrs_width": round(qrs_width, 1),
    }


def compute_hrv_spectrum(rr_intervals, fs):
    """Compute HRV power spectral density."""
    if len(rr_intervals) < 4:
        return {
            "frequencies": [], "power": [],
            "lf_power": 0, "hf_power": 0, "lf_hf_ratio": 0,
        }

    # Interpolate RR to uniform sampling (4 Hz)
    rr_times = np.cumsum(rr_intervals) / 1000.0  # seconds
    rr_times = rr_times - rr_times[0]
    interp_fs = 4.0
    t_uniform = np.arange(0, rr_times[-1], 1.0 / interp_fs)

    if len(t_uniform) < 8:
        return {
            "frequencies": [], "power": [],
            "lf_power": 0, "hf_power": 0, "lf_hf_ratio": 0,
        }

    rr_interp = np.interp(t_uniform, rr_times, rr_intervals)
    rr_interp = rr_interp - np.mean(rr_interp)

    # Welch PSD
    nperseg = min(len(rr_interp), 256)
    freqs, psd = welch(rr_interp, fs=interp_fs, nperseg=nperseg)

    # LF (0.04 - 0.15 Hz), HF (0.15 - 0.4 Hz)
    lf_mask = (freqs >= 0.04) & (freqs < 0.15)
    hf_mask = (freqs >= 0.15) & (freqs < 0.4)
    lf_power = float(np.trapz(psd[lf_mask], freqs[lf_mask])) if np.any(lf_mask) else 0
    hf_power = float(np.trapz(psd[hf_mask], freqs[hf_mask])) if np.any(hf_mask) else 0
    lf_hf_ratio = lf_power / hf_power if hf_power > 0 else 0

    return {
        "frequencies": freqs.tolist(),
        "power": psd.tolist(),
        "lf_power": round(lf_power, 2),
        "hf_power": round(hf_power, 2),
        "lf_hf_ratio": round(lf_hf_ratio, 2),
    }


def compute_poincare(rr_intervals):
    """Compute Poincaré plot data."""
    if len(rr_intervals) < 3:
        return {"rr_n": [], "rr_n1": [], "sd1": 0, "sd2": 0}

    rr_n = rr_intervals[:-1]
    rr_n1 = rr_intervals[1:]

    diff_rr = rr_n1 - rr_n
    sum_rr = rr_n1 + rr_n

    sd1 = float(np.std(diff_rr) / np.sqrt(2))
    sd2 = float(np.std(sum_rr) / np.sqrt(2))

    return {
        "rr_n": rr_n.tolist(),
        "rr_n1": rr_n1.tolist(),
        "sd1": round(sd1, 1),
        "sd2": round(sd2, 1),
    }


def compute_ecg_quality(signal, peaks, fs):
    """Signal quality index 0-100."""
    if len(peaks) < 3:
        return 20.0

    # Check regularity of RR intervals
    rr = np.diff(peaks) / fs
    rr_cv = np.std(rr) / np.mean(rr) if np.mean(rr) > 0 else 1

    # Check SNR estimate
    peak_amplitudes = np.abs(signal[peaks])
    noise_est = np.std(signal) 
    snr = np.mean(peak_amplitudes) / noise_est if noise_est > 0 else 1

    # Quality score
    regularity_score = max(0, 1 - rr_cv) * 50  # 0-50
    snr_score = min(snr * 10, 50)  # 0-50

    return round(min(regularity_score + snr_score, 100), 1)


# ──────────────────────────────────────────────
# EMG PROCESSING
# ──────────────────────────────────────────────

def process_emg(signal, fs=1000):
    """Full EMG processing pipeline."""
    sig = np.array(signal, dtype=np.float64)
    sig = sig - np.mean(sig)

    # Bandpass 20-450 Hz
    max_freq = min(450, fs * 0.45)
    filtered = bandpass_filter(sig, 20.0, max_freq, fs, order=4)

    # Notch 50 Hz
    filtered = notch_filter(filtered, 50.0, fs)

    # Envelope (Hilbert)
    analytic = hilbert(filtered)
    envelope = np.abs(analytic)
    # Smooth envelope
    win = int(0.05 * fs)
    if win < 1:
        win = 1
    kernel = np.ones(win) / win
    envelope = np.convolve(envelope, kernel, mode='same')

    # Features
    features = compute_emg_features(filtered, fs)

    # PSD
    psd_data = compute_emg_psd(filtered, fs)

    # Fatigue analysis (mean frequency over windows)
    fatigue = compute_emg_fatigue(filtered, fs)

    return {
        "filtered_signal": filtered.tolist(),
        "envelope": envelope.tolist(),
        "features": features,
        "psd": psd_data,
        "fatigue": fatigue,
    }


def compute_emg_features(signal, fs):
    """Compute EMG time and frequency domain features."""
    rms = float(np.sqrt(np.mean(signal ** 2)))
    mav = float(np.mean(np.abs(signal)))

    # Zero crossing rate
    zero_crossings = np.sum(np.diff(np.sign(signal)) != 0)
    zcr = float(zero_crossings / len(signal))

    # Waveform length
    wl = float(np.sum(np.abs(np.diff(signal))))

    # Slope sign changes
    diff_sig = np.diff(signal)
    ssc = float(np.sum(np.diff(np.sign(diff_sig)) != 0))

    # Frequency domain features
    nperseg = min(len(signal), 1024)
    freqs, psd = welch(signal, fs=fs, nperseg=nperseg)
    total_power = np.sum(psd)

    if total_power > 0:
        mnf = float(np.sum(freqs * psd) / total_power)
        cumulative = np.cumsum(psd)
        mdf_idx = np.searchsorted(cumulative, total_power / 2)
        mdf = float(freqs[min(mdf_idx, len(freqs) - 1)])
    else:
        mnf = 0
        mdf = 0

    # Variance
    var = float(np.var(signal))

    return {
        "rms": round(rms, 6),
        "mav": round(mav, 6),
        "zcr": round(zcr, 6),
        "wl": round(wl, 4),
        "ssc": round(ssc, 1),
        "mnf": round(mnf, 1),
        "mdf": round(mdf, 1),
        "var": round(var, 8),
    }


def compute_emg_psd(signal, fs):
    """Compute EMG power spectral density."""
    nperseg = min(len(signal), 2048)
    freqs, psd = welch(signal, fs=fs, nperseg=nperseg)
    return {
        "frequencies": freqs.tolist(),
        "power": psd.tolist(),
    }


def compute_emg_fatigue(signal, fs, window_sec=0.5):
    """Compute mean frequency over time windows for fatigue tracking."""
    window_samples = int(window_sec * fs)
    if window_samples < 64:
        window_samples = 64

    n_windows = len(signal) // window_samples
    mean_freqs = []

    for i in range(n_windows):
        segment = signal[i * window_samples:(i + 1) * window_samples]
        nperseg = min(len(segment), 256)
        freqs, psd = welch(segment, fs=fs, nperseg=nperseg)
        total = np.sum(psd)
        if total > 0:
            mf = float(np.sum(freqs * psd) / total)
        else:
            mf = 0
        mean_freqs.append(mf)

    # Fatigue score: how much has mean freq dropped?
    if len(mean_freqs) >= 2 and mean_freqs[0] > 0:
        freq_drop = (mean_freqs[0] - mean_freqs[-1]) / mean_freqs[0]
        fatigue_score = max(0, min(1, freq_drop * 2))
    else:
        fatigue_score = 0

    fatigue_level = "Fresh"
    if fatigue_score > 0.66:
        fatigue_level = "High Fatigue"
    elif fatigue_score > 0.33:
        fatigue_level = "Mild Fatigue"

    return {
        "mean_frequency_over_time": mean_freqs,
        "fatigue_score": round(fatigue_score, 3),
        "fatigue_level": fatigue_level,
    }


# ──────────────────────────────────────────────
# EEG PROCESSING
# ──────────────────────────────────────────────

def process_eeg(signal, fs=256):
    """Full EEG processing pipeline."""
    sig = np.array(signal, dtype=np.float64)
    sig = sig - np.mean(sig)

    # Bandpass 0.5-50 Hz
    filtered = bandpass_filter(sig, 0.5, min(50, fs * 0.45), fs, order=4)
    # Notch 50 Hz
    if fs > 100:
        filtered = notch_filter(filtered, 50.0, fs)

    # Band powers
    bands = compute_eeg_bands(filtered, fs)

    # Features
    features = compute_eeg_features(bands, filtered, fs)

    # Band spectrum over time
    band_spectrum = compute_eeg_band_spectrum(filtered, fs)

    return {
        "filtered_signal": filtered.tolist(),
        "features": features,
        "band_spectrum": band_spectrum,
    }


def compute_eeg_bands(signal, fs):
    """Compute absolute and relative power in EEG bands."""
    nperseg = min(len(signal), 1024)
    freqs, psd = welch(signal, fs=fs, nperseg=nperseg)

    bands = {
        "delta": (0.5, 4),
        "theta": (4, 8),
        "alpha": (8, 13),
        "beta": (13, 30),
        "gamma": (30, 50),
    }

    powers = {}
    total_power = np.trapz(psd, freqs)

    for name, (lo, hi) in bands.items():
        mask = (freqs >= lo) & (freqs < hi)
        band_power = np.trapz(psd[mask], freqs[mask]) if np.any(mask) else 0
        powers[f"{name}_abs"] = float(band_power)
        powers[f"{name}_rel"] = float(band_power / total_power) if total_power > 0 else 0

    powers["total"] = float(total_power)
    powers["frequencies"] = freqs.tolist()
    powers["psd"] = psd.tolist()

    return powers


def compute_eeg_features(bands, signal, fs):
    """Compute EEG features from band powers."""
    delta_rel = bands.get("delta_rel", 0)
    theta_rel = bands.get("theta_rel", 0)
    alpha_rel = bands.get("alpha_rel", 0)
    beta_rel = bands.get("beta_rel", 0)
    gamma_rel = bands.get("gamma_rel", 0)

    # Alpha/Beta ratio
    alpha_beta_ratio = alpha_rel / beta_rel if beta_rel > 0 else 0

    # Spectral entropy
    nperseg = min(len(signal), 1024)
    freqs, psd = welch(signal, fs=fs, nperseg=nperseg)
    psd_norm = psd / np.sum(psd) if np.sum(psd) > 0 else psd
    psd_norm = psd_norm[psd_norm > 0]
    spectral_entropy = float(scipy_entropy(psd_norm, base=2))

    # Engagement index: beta / (alpha + theta)
    denom = alpha_rel + theta_rel
    engagement_index = beta_rel / denom if denom > 0 else 0

    # Mental state (rule-based)
    if alpha_beta_ratio > 1.5:
        mental_state = "Relaxed"
    elif alpha_beta_ratio < 0.8:
        mental_state = "Focused"
    elif theta_rel > 0.25:
        mental_state = "Drowsy"
    else:
        mental_state = "Neutral"

    # Dominant band
    band_vals = {
        "Delta": delta_rel, "Theta": theta_rel,
        "Alpha": alpha_rel, "Beta": beta_rel, "Gamma": gamma_rel,
    }
    dominant_band = max(band_vals, key=band_vals.get)

    return {
        "delta_rel": round(delta_rel, 4),
        "theta_rel": round(theta_rel, 4),
        "alpha_rel": round(alpha_rel, 4),
        "beta_rel": round(beta_rel, 4),
        "gamma_rel": round(gamma_rel, 4),
        "alpha_beta_ratio": round(alpha_beta_ratio, 2),
        "spectral_entropy": round(spectral_entropy, 2),
        "engagement_index": round(engagement_index, 3),
        "mental_state": mental_state,
        "dominant_band": dominant_band,
    }


def compute_eeg_band_spectrum(signal, fs, window_sec=2.0):
    """Compute band power changes over time."""
    window_samples = int(window_sec * fs)
    if window_samples < 64:
        window_samples = 64

    n_windows = len(signal) // window_samples
    times = []
    delta_over_time = []
    theta_over_time = []
    alpha_over_time = []
    beta_over_time = []
    gamma_over_time = []

    for i in range(n_windows):
        seg = signal[i * window_samples:(i + 1) * window_samples]
        bands = compute_eeg_bands(seg, fs)
        times.append(round((i + 0.5) * window_sec, 2))
        delta_over_time.append(round(bands.get("delta_rel", 0), 4))
        theta_over_time.append(round(bands.get("theta_rel", 0), 4))
        alpha_over_time.append(round(bands.get("alpha_rel", 0), 4))
        beta_over_time.append(round(bands.get("beta_rel", 0), 4))
        gamma_over_time.append(round(bands.get("gamma_rel", 0), 4))

    return {
        "times": times,
        "delta": delta_over_time,
        "theta": theta_over_time,
        "alpha": alpha_over_time,
        "beta": beta_over_time,
        "gamma": gamma_over_time,
    }


# ──────────────────────────────────────────────
# FEATURE EXTRACTION FOR ML MODELS
# ──────────────────────────────────────────────

def extract_ecg_ml_features(signal, fs=360):
    """Extract feature vector for ECG ML model."""
    result = process_ecg(signal, fs)
    f = result["features"]
    h = result["hrv_spectrum"]
    return [
        f["hr_bpm"], f["mean_rr"], f["std_rr"],
        f["rmssd"], f["pnn50"], f["qrs_width"],
        h["lf_power"], h["hf_power"], h["lf_hf_ratio"],
    ]


def extract_emg_ml_features(signal, fs=1000):
    """Extract feature vector for EMG ML model."""
    result = process_emg(signal, fs)
    f = result["features"]
    return [
        f["rms"], f["mav"], f["zcr"],
        f["wl"], f["ssc"], f["mnf"],
        f["mdf"], f["var"],
    ]


def extract_eeg_ml_features(signal, fs=256):
    """Extract feature vector for EEG ML model."""
    result = process_eeg(signal, fs)
    f = result["features"]
    return [
        f["delta_rel"], f["theta_rel"], f["alpha_rel"],
        f["beta_rel"], f["gamma_rel"],
        f["alpha_beta_ratio"], f["spectral_entropy"],
        f["engagement_index"],
    ]
