import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';
const PORT = 3000;

const app = express();

// Increase JSON payload size to support base64 photos from Android cameras
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health check and config status endpoint (never exposes raw keys)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Endpoint to download the entire generated Android native project archive
app.get('/api/download-android-project', (_req: Request, res: Response) => {
  const tarPath = path.resolve(__dirname, 'catatan-iswandi-android-project.tar.gz');
  import('child_process').then(({ execSync }) => {
    try {
      execSync('tar -czf catatan-iswandi-android-project.tar.gz android capacitor.config.json', { cwd: __dirname });
      res.download(tarPath, 'catatan-iswandi-android-project.tar.gz');
    } catch (e: any) {
      res.status(500).json({ error: 'Gagal membuat arsip proyek Android: ' + e.message });
    }
  });
});

// Endpoint to download the full GitHub-ready project ZIP (contains .github/workflows/build-apk.yml)
app.get('/api/download-full-project.zip', (_req: Request, res: Response) => {
  const zipPath = path.resolve(__dirname, 'catatan-by-iswandi-source.zip');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="catatan-by-iswandi-source.zip"');
  return res.sendFile(zipPath);
});

// Endpoint to automatically push the repository directly to user's GitHub from mobile
app.post('/api/github/push', async (req: Request, res: Response) => {
  try {
    const { repoUrl, token } = req.body;
    if (!repoUrl || !token) {
      return res.status(400).json({
        error: 'URL Repositori GitHub dan GitHub Personal Access Token wajib diisi.',
      });
    }

    let cleanUrl = repoUrl.trim().replace(/\.git$/, '');
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = `https://github.com/${cleanUrl}`;
    }
    const match = cleanUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      return res.status(400).json({
        error: 'Format URL GitHub tidak valid. Contoh: https://github.com/username/catatan-iswandi',
      });
    }

    const owner = match[1];
    const repo = match[2];
    const authenticatedUrl = `https://${encodeURIComponent(token.trim())}@github.com/${owner}/${repo}.git`;

    const { execSync } = await import('child_process');

    execSync('git config --global user.name "Catatan by Iswandi"', { cwd: __dirname });
    execSync('git config --global user.email "bot@catatan-iswandi.local"', { cwd: __dirname });

    if (!fs.existsSync(path.resolve(__dirname, '.git'))) {
      execSync('git init -b main', { cwd: __dirname });
    } else {
      execSync('git checkout -B main', { cwd: __dirname });
    }

    execSync('git add -A', { cwd: __dirname });
    execSync('git commit -m "Catatan by Iswandi - Siap Build APK GitHub Actions" --allow-empty', { cwd: __dirname });
    execSync(`git push "${authenticatedUrl}" main --force`, { cwd: __dirname });

    return res.json({
      success: true,
      repoUrl: `https://github.com/${owner}/${repo}`,
      actionsUrl: `https://github.com/${owner}/${repo}/actions`,
      releasesUrl: `https://github.com/${owner}/${repo}/releases`,
    });
  } catch (err: unknown) {
    console.error('Git push error:', err);
    const msg = err instanceof Error ? err.message : 'Periksa URL repositori dan izin token GitHub Anda.';
    return res.status(500).json({
      error: `Gagal mengirim ke GitHub: ${msg}`,
    });
  }
});

app.get('/api/config-status', (req: Request, res: Response) => {
  const customKey = req.headers['x-gemini-api-key'] as string | undefined;
  const hasEnvKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  const hasCustomKey = Boolean(customKey && customKey.trim().length > 10);
  res.json({
    hasServerKey: hasEnvKey,
    hasClientKey: hasCustomKey,
    ready: hasEnvKey || hasCustomKey,
  });
});

// Scan AI endpoint for handwritten / printed fish notebook photos
app.post('/api/gemini/scan', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    const clientProvidedKey = req.headers['x-gemini-api-key'] as string | undefined;

    const apiKey = clientProvidedKey?.trim() || process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(400).json({
        error: 'Kunci Gemini API belum dikonfigurasi di server atau pengaturan aplikasi. Silakan atur di Pengaturan atau konfigurasi Secrets.',
      });
    }

    if (!imageBase64) {
      return res.status(400).json({
        error: 'Foto belum disediakan untuk proses scan.',
      });
    }

    // Clean base64 string
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemPrompt = `Anda adalah asisten cerdas spesialis membaca dan mengekstrak data tulisan tangan atau cetak dari buku catatan hasil tangkapan/pembukuan ikan nelayan (Indonesia).
Tugas Anda membaca halaman buku catatan ini dengan cermat dan teliti.
Ekstrak komponen berikut:
1. tanggal: tanggal catatan jika tertulis (format YYYY-MM-DD jika memungkinkan, atau teks aslinya).
2. rumpon: nama rumpon, lokasi laut, atau nama perahu/kapal jika tertulis (contoh: "Rumpon 03", "Rumpon Karang", "Perahu Jaya").
3. items: daftar ikan yang tertulis. Untuk setiap baris ikan:
   - namaIkan: nama jenis ikan (contoh: Cakalang, Tongkol, Tuna, Layang, Deho, Madidihang, Kembung, dll).
   - beratKg: berat dalam Kilogram (konversikan jika ditulis dalam ton atau keranjang/basket jika ada keterangannya, jika ditulis kg gunakan nilai kg).
   - hargaPerKg: harga satuan per kg jika tercantum (dalam angka Rupiah). Jika tidak tercantum, isi null atau 0.
   - subtotal: total harga untuk jenis ikan ini jika tercantum (dalam angka Rupiah).
   - confidence: tingkat keyakinan pembacaan tulisan tangan ("high" jika jelas, "low" atau "uncertain" jika samar/ragu/coretan).
4. totalBeratKg: total berat seluruh ikan dalam kg jika tertulis, atau null jika tidak ada penjumlahan di buku.
5. totalHarga: total pendapatan/harga ikan jika tercantum di buku (angka Rupiah).
6. catatan: catatan tambahan yang ada di halaman (kondisi cuaca, keterangan pengeluaran, nomor nota, dll).
7. unreadableNotes: daftar keterangan angka/tulisan yang buram, terpotong, atau dicoret yang memerlukan verifikasi manual oleh pengguna.

PENTING:
- JANGAN mengarang angka jika tidak terbaca. Tandai dengan confidence "uncertain" dan masukkan ke unreadableNotes.
- Pengguna akan memvalidasi semua hasil sebelum disimpan.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64,
          },
        },
        {
          text: 'Tolong baca buku catatan pembukuan ikan ini dan ekstrak seluruh data tabel/baris jenis ikan, berat, harga, tanggal, rumpon, dan catatannya sesuai skema JSON.',
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tanggal: { type: Type.STRING, description: 'Tanggal catatan YYYY-MM-DD atau teks asli' },
            rumpon: { type: Type.STRING, description: 'Nama rumpon atau lokasi' },
            items: {
              type: Type.ARRAY,
              description: 'Daftar jenis ikan yang tercatat',
              items: {
                type: Type.OBJECT,
                properties: {
                  namaIkan: { type: Type.STRING },
                  beratKg: { type: Type.NUMBER },
                  hargaPerKg: { type: Type.NUMBER },
                  subtotal: { type: Type.NUMBER },
                  confidence: { type: Type.STRING },
                },
                required: ['namaIkan', 'beratKg', 'confidence'],
              },
            },
            totalBeratKg: { type: Type.NUMBER },
            totalHarga: { type: Type.NUMBER },
            catatan: { type: Type.STRING },
            unreadableNotes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['items'],
        },
      },
    });

    const responseText = response.text || '{}';
    let parsedData = {};
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      parsedData = { items: [], catatan: responseText };
    }

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (err: unknown) {
    console.error('Error during Gemini scan:', err);
    const errorMessage = err instanceof Error ? err.message : 'Gagal memproses foto catatan.';
    return res.status(500).json({
      error: `Gagal memproses scan AI: ${errorMessage}`,
    });
  }
});

// Mount Vite or static dist
async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Catatan by Iswandi running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
