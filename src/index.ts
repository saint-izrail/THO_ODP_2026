import { app } from "./app";

// Entry untuk pengembangan lokal: jalankan server HTTP.
// Di Vercel (serverless) entry-nya adalah api/index.ts yang meng-export app.
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
