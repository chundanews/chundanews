const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

// Apni Firebase Admin SDK ki service account key file yahan lagayein
// (Ya aap web SDK config use karke bhi data fetch kar sakte hain)
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const DOMAIN = 'https://chundanewsive.in'; // Aapka domain naam (jaisa sitemap me hai)

async function generateSitemap() {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  // Sabse pehle Homepage add karein
  xml += `  <url>\n`;
  xml += `    <loc>${DOMAIN}/</loc>\n`;
  xml += `    <changefreq>hourly</changefreq>\n`;
  xml += `    <priority>1.0</priority>\n`;
  xml += `  </url>\n`;

  try {
    // 'articles' collection se saare documents fetch karein (apne collection ka naam yahan check kar lein)
    const snapshot = await db.collection('articles').get();
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Maan lijiye aapke article ka slug ya id field 'slug' ya 'id' hai
      const articleSlug = data.slug || doc.id; 
      const lastMod = data.updatedAt ? new Date(data.updatedAt.toDate()).toISOString() : new Date().toISOString();

      xml += `  <url>\n`;
      xml += `    <loc>${DOMAIN}/article/${articleSlug}</loc>\n`;
      xml += `    <lastmod>${lastMod}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      xml += `  </url>\n`;
    });

    xml += `</urlset>`;

    // Sitemap file ko root folder me save karein
    fs.writeFileSync('./sitemap.xml', xml);
    console.log('Sitemap.xml successfully generate ho gaya hai aur saare articles add ho gaye hain!');
  } catch (error) {
    console.erorr('Error generating sitemap:', error);
  }
}

generateSitemap();