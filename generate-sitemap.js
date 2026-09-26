const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const DOMAIN = 'https://chundanewslive.in';

function getIsoDate(value) {
  if (!value) return new Date().toISOString();

  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function generateSitemap() {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  xml += '  <url>\n';
  xml += '    <loc>' + DOMAIN + '/</loc>\n';
  xml += '    <changefreq>hourly</changefreq>\n';
  xml += '    <priority>1.0</priority>\n';
  xml += '  </url>\n';

  try {
    const snapshot = await db.collection('news_posts').get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      const articleId = encodeURIComponent(doc.id);
      const lastMod = getIsoDate(data.updatedAt || data.createdAt || data.publishedAt);

      xml += '  <url>\n';
      xml += '    <loc>' + DOMAIN + '/article.html?id=' + articleId + '</loc>\n';
      xml += '    <lastmod>' + lastMod + '</lastmod>\n';
      xml += '    <changefreq>daily</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';
    });

    xml += '</urlset>\n';

    fs.writeFileSync('./sitemap.xml', xml, 'utf8');
    console.log('Sitemap generated successfully for news_posts.');
  } catch (error) {
    console.error('Error generating sitemap:', error);
    process.exitCode = 1;
  }
}

generateSitemap();