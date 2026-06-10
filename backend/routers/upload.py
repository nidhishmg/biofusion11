"""
BioFusion AI — Upload Router
File upload endpoints for ECG, EMG, EEG files
"""
import os
import io
import tempfile
import numpy as np
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List

router = APIRouter(tags=["Upload"])


def _looks_like_time_series(values: np.ndarray) -> bool:
    """Heuristic to detect time/index-like numeric columns."""
    if values is None or len(values) < 10:
        return False

    diffs = np.diff(values)
    if len(diffs) == 0:
        return False

    # Time/index is usually monotonic non-decreasing.
    monotonic = np.all(diffs >= -1e-12)
    if not monotonic:
        return False

    # Constant or near-constant spacing strongly indicates sampled time/index.
    positive = diffs[diffs > 1e-12]
    if len(positive) == 0:
        return True

    mean_step = float(np.mean(positive))
    std_step = float(np.std(positive))
    if mean_step <= 0:
        return True

    return (std_step / mean_step) < 0.2


def _select_signal_column(df: pd.DataFrame, signal_type: str) -> np.ndarray:
    """Select the best numeric signal column, avoiding time/index columns."""
    candidates = []

    for col in df.columns:
        vals = pd.to_numeric(df[col], errors='coerce').dropna()
        if len(vals) > 10:
            arr = vals.values.astype(float)
            candidates.append((col, arr))

    if not candidates:
        raise HTTPException(
            status_code=400,
            detail=f"{signal_type} CSV parsing failed: no numeric signal column found",
        )

    if len(candidates) == 1:
        return candidates[0][1]

    # Common 2-column CSV: first is time/index, second is signal.
    if len(candidates) == 2:
        first_is_time = _looks_like_time_series(candidates[0][1])
        second_is_time = _looks_like_time_series(candidates[1][1])
        if first_is_time and not second_is_time:
            return candidates[1][1]
        if second_is_time and not first_is_time:
            return candidates[0][1]

    signal_keywords = {
        'ecg': ['ecg', 'signal', 'value', 'lead', 'mlii', 'amplitude'],
        'emg': ['emg', 'signal', 'value', 'muscle', 'amplitude'],
        'eeg': ['eeg', 'signal', 'value', 'channel', 'amplitude'],
    }
    time_keywords = ['time', 'timestamp', 'sample', 'index', 'sec', 'ms']

    selected = None
    best_score = -10**9

    for col, arr in candidates:
        name = str(col).strip().lower()
        score = 0.0

        # Prefer obvious signal column names.
        for kw in signal_keywords.get(signal_type.lower(), ['signal', 'value', 'amplitude']):
            if kw in name:
                score += 4

        # Penalize time/index-like names.
        for kw in time_keywords:
            if kw in name:
                score -= 6

        # Penalize time/index-like value shape.
        if _looks_like_time_series(arr):
            score -= 7

        # Prefer non-constant and longer columns.
        if float(np.std(arr)) < 1e-10:
            score -= 3
        score += min(len(arr) / 20000.0, 1.0)

        if score > best_score:
            best_score = score
            selected = arr

    return selected


@router.post("/ecg")
async def upload_ecg(files: List[UploadFile] = File(...)):
    """Upload ECG files (.dat+.hea pair or .csv)."""
    try:
        return await _parse_ecg_files(files)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/emg")
async def upload_emg(files: List[UploadFile] = File(...)):
    """Upload EMG files (.csv or .dat+.hea pair)."""
    try:
        return await _parse_emg_files(files)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/eeg")
async def upload_eeg(files: List[UploadFile] = File(...)):
    """Upload EEG files (.edf)."""
    try:
        return await _parse_eeg_files(files)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/detect")
async def upload_detect(files: List[UploadFile] = File(...)):
    """Auto-detect file type and parse accordingly."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    filenames = [f.filename.lower() for f in files]
    extensions = set(os.path.splitext(fn)[1] for fn in filenames)

    # Check for EDF → EEG
    if any(fn.endswith('.edf') for fn in filenames):
        return await _parse_eeg_files(files)

    # Check for EMG CSV files
    emg_names = ['emg_healthy', 'emg_myopathy', 'emg_neuropathy']
    if any(any(e in fn for e in emg_names) for fn in filenames):
        return await _parse_emg_files(files)

    # Check for .dat + .hea → ECG (WFDB)
    if '.dat' in extensions or '.hea' in extensions:
        return await _parse_ecg_files(files)

    # Check for generic CSV
    if '.csv' in extensions:
        return await _parse_generic_csv(files)

    raise HTTPException(
        status_code=400,
        detail=f"Could not auto-detect file type for: {', '.join(filenames)}"
    )


async def _parse_ecg_files(files):
    """Parse ECG files using wfdb."""
    import wfdb

    with tempfile.TemporaryDirectory() as tmpdir:
        saved = {}
        for f in files:
            content = await f.read()
            path = os.path.join(tmpdir, f.filename)
            with open(path, 'wb') as fp:
                fp.write(content)
            base = os.path.splitext(f.filename)[0]
            saved[base] = True

        # Find the record name (base without extension)
        record_name = None
        for fname in os.listdir(tmpdir):
            if fname.endswith('.dat'):
                record_name = os.path.splitext(fname)[0]
                break
            if fname.endswith('.hea'):
                record_name = os.path.splitext(fname)[0]
                break
            if fname.endswith('.csv'):
                # Read CSV directly
                csv_path = os.path.join(tmpdir, fname)
                try:
                    df = pd.read_csv(csv_path)
                except Exception:
                    df = pd.read_csv(csv_path, header=None)

                signal = _select_signal_column(df, "ecg")

                signal = (signal - np.mean(signal)) / (np.std(signal) + 1e-8)
                return {
                    "signal": signal.tolist(),
                    "sample_rate": 360,
                    "duration_seconds": round(len(signal) / 360, 2),
                    "num_samples": len(signal),
                    "signal_type": "ECG",
                    "filename": fname,
                }

        if record_name is None:
            raise HTTPException(status_code=400, detail="No .dat or .hea file found")

        record_path = os.path.join(tmpdir, record_name)
        record = wfdb.rdrecord(record_path)
        signal = record.p_signal[:, 0]  # First channel (MLII)
        fs = record.fs

        # Normalize
        signal = (signal - np.mean(signal)) / (np.std(signal) + 1e-8)

        # Limit to 30 seconds for frontend performance
        max_samples = int(30 * fs)
        if len(signal) > max_samples:
            signal = signal[:max_samples]

        return {
            "signal": signal.tolist(),
            "sample_rate": int(fs),
            "duration_seconds": round(len(signal) / fs, 2),
            "num_samples": len(signal),
            "signal_type": "ECG",
            "filename": f"{record_name}.dat",
        }


async def _parse_emg_files(files):
    """Parse EMG CSV files."""
    from scipy.signal import decimate

    for f in files:
        content = await f.read()
        fname = f.filename.lower()

        # Detect condition from filename
        if 'healthy' in fname:
            condition = 'Healthy'
        elif 'myopathy' in fname:
            condition = 'Myopathy'
        elif 'neuropathy' in fname:
            condition = 'Neuropathy'
        else:
            condition = 'Unknown'

        # Try tab-separated first, then comma
        try:
            df = pd.read_csv(io.BytesIO(content), sep='\t', header=None)
            if df.shape[1] < 2:
                df = pd.read_csv(io.BytesIO(content), sep=',', header=None)
        except Exception:
            df = pd.read_csv(io.BytesIO(content), header=None)

        # Check if first row is a header (non-numeric)
        try:
            float(df.iloc[0, 0])
        except (ValueError, TypeError):
            df = df.iloc[1:]
            df = df.reset_index(drop=True)

        signal = _select_signal_column(df, "emg")

        # Original sample rate is 4000 Hz, downsample to 1000 Hz
        original_fs = 4000
        target_fs = 1000
        q = original_fs // target_fs
        if q > 1:
            signal = decimate(signal, q)

        # Normalize
        signal = (signal - np.mean(signal)) / (np.std(signal) + 1e-8)

        return {
            "signal": signal.tolist(),
            "sample_rate": target_fs,
            "duration_seconds": round(len(signal) / target_fs, 2),
            "num_samples": len(signal),
            "signal_type": "EMG",
            "condition": condition,
            "filename": f.filename,
        }

    raise HTTPException(status_code=400, detail="No EMG file provided")


async def _parse_eeg_files(files):
    """Parse EEG EDF files using mne."""
    import mne

    for f in files:
        content = await f.read()
        fname = f.filename
        lower_name = fname.lower()

        # Support EEG CSV/TXT uploads as stated in frontend UI.
        if lower_name.endswith('.csv') or lower_name.endswith('.txt'):
            try:
                df = pd.read_csv(io.BytesIO(content))
            except Exception:
                df = pd.read_csv(io.BytesIO(content), header=None)

            signal = _select_signal_column(df, "eeg")

            fs = 256
            signal = (signal - np.mean(signal)) / (np.std(signal) + 1e-8)

            max_samples = int(30 * fs)
            if len(signal) > max_samples:
                signal = signal[:max_samples]

            return {
                "signal": signal.tolist(),
                "sample_rate": fs,
                "duration_seconds": round(len(signal) / fs, 2),
                "num_samples": len(signal),
                "signal_type": "EEG",
                "channels": ["EEG-CSV"],
                "filename": fname,
                "note": "CSV/TXT EEG parsed with assumed sample rate 256 Hz",
            }

        with tempfile.NamedTemporaryFile(suffix='.edf', delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            try:
                raw = mne.io.read_raw_edf(tmp_path, preload=True, verbose=False)
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "EEG EDF parsing failed. Ensure the file is a valid .edf recording "
                        f"(parser detail: {str(e)})"
                    ),
                )

            signal = raw.get_data()[0]  # First channel
            fs = raw.info['sfreq']

            # Normalize
            signal = (signal - np.mean(signal)) / (np.std(signal) + 1e-8)

            # Limit to 30 seconds
            max_samples = int(30 * fs)
            if len(signal) > max_samples:
                signal = signal[:max_samples]

            return {
                "signal": signal.tolist(),
                "sample_rate": int(fs),
                "duration_seconds": round(len(signal) / fs, 2),
                "num_samples": len(signal),
                "signal_type": "EEG",
                "channels": raw.ch_names[:5],
                "filename": fname,
            }
        finally:
            os.unlink(tmp_path)

    raise HTTPException(status_code=400, detail="No EEG file provided")


async def _parse_generic_csv(files):
    """Parse generic CSV file."""
    for f in files:
        content = await f.read()

        try:
            df = pd.read_csv(io.BytesIO(content))
        except Exception:
            df = pd.read_csv(io.BytesIO(content), header=None)

        signal = _select_signal_column(df, "signal")

        signal = (signal - np.mean(signal)) / (np.std(signal) + 1e-8)

        return {
            "signal": signal.tolist(),
            "sample_rate": 500,
            "duration_seconds": round(len(signal) / 500, 2),
            "num_samples": len(signal),
            "signal_type": "Unknown",
            "filename": f.filename,
            "note": "Generic CSV — sample rate assumed 500 Hz",
        }

    raise HTTPException(status_code=400, detail="No file provided")
