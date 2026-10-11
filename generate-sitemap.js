const fs = require('fs');
const https = require('https');

const PROJECT_ID = 'chunda-news';
const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY;
const DOMAIN = 'https://chundanewslive.in';
const PUBLICATION_NAME = 'CHUNDA KSHETRA NEWS';
const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;

function firestoreQuery(collection, field, value) {
  return new Promise((resolve, reject) => {
    const structuredQuery = { from: [{ collectionId: collection }] };
    if (field && value !== undefined) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: field },
          op: 'EQUAL',
          value: { stringValue: value }
        }
      };
    }
    const body = JSON.stringify({ structuredQuery });
    const req = https.request(
      'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
      '/databases/(default)/documents:runQuery?key=' + encodeURIComponent(FIREBASE_API_KEY || ''),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      res => {
        let response = '';
        res.on('data', chunk => response += chunk);
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error('Firestore query failed: HTTP ' + res.statusCode + ' ' + response));
          }
          try {
            resolve(JSON.parse(response).filter(item => item.document).map(item => item.document));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
}

function fromFirestoreFields(fields) {
  const output = {};
  for (const [key, value] of Object.entries(fields || {})) output[key] = decodeValue(value);
  return output;
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toIsoDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function newsPublicationDate(data) {
  return toIsoDate(data.createdAt) || toIsoDate(data.publishedAt) ||
    toIsoDate(data.datePublished) || toIsoDate(data.date);
}

async function generateSitemap() {
  if (!FIREBASE_API_KEY) throw new Error('FIREBASE_WEB_API_KEY is required.');

  // News posts are published directly by the site's admin form; they do not
  // have a consistent "published" field, so include the whole collection.
  const articles = await firestoreQuery('news_posts');
  const panchayatResults = await firestoreQuery('panchayat_results', 'status', 'published');

  const urlEntries = new Map();
  urlEntries.set(DOMAIN + '/', {
    url: DOMAIN + '/',
    lastmod: '',
    priority: '1.0',
    changefreq: 'hourly'
  });

  for (const doc of articles) {
    const data = fromFirestoreFields(doc.fields);
    const url = DOMAIN + '/article.html?id=' + encodeURIComponent(doc.name.split('/').pop() || doc.id);
    const lastmod = toIsoDate(data.updatedAt) || newsPublicationDate(data);
    urlEntries.set(url, { url, lastmod, priority: '0.8', changefreq: 'daily' });
  }

  for (const doc of panchayatResults) {
    const data = fromFirestoreFields(doc.fields);
    const params = new URLSearchParams({
      district: data.district || '',
      ps: data.panchayatSamiti || '',
      gp: data.gramPanchayat || '',
      village: data.village || '',
      ward: data.ward || ''
    });
    const url = DOMAIN + '/?' + params.toString();
    const lastmod = toIsoDate(data.updatedAt) || toIsoDate(data.verifiedAt) || toIsoDate(data.createdAt);
    urlEntries.set(url, { url, lastmod, priority: '0.7', changefreq: 'daily' });
  }

  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
  sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const entry of urlEntries.values()) {
    sitemap += '  <url>\n    <loc>' + xmlEscape(entry.url) + '</loc>\n';
    if (entry.lastmod) sitemap += '    <lastmod>' + entry.lastmod + '</lastmod>\n';
    sitemap += '    <changefreq>' + entry.changefreq + '</changefreq>\n';
    sitemap += '    <priority>' + entry.priority + '</priority>\n  </url>\n';
  }
  sitemap += '</urlset>\n';
  fs.writeFileSync('./sitemap.xml', sitemap, 'utf8');

  const cutoff = Date.now() - NEWS_WINDOW_MS;
  const recentNews = articles.map(doc => {
    const data = fromFirestoreFields(doc.fields);
    return {
      id: doc.name.split('/').pop() || doc.id,
      title: String(data.title || '').trim(),
      published: newsPublicationDate(data)
    };
  }).filter(item => {
    const time = item.published ? Date.parse(item.published) : NaN;
    return item.title && Number.isFinite(time) && time >= cutoff && time <= Date.now();
  });

  let newsSitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
  newsSitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n';
  for (const item of recentNews) {
    const url = DOMAIN + '/article.html?id=' + encodeURIComponent(item.id);
    newsSitemap += '  <url>\n    <loc>' + xmlEscape(url) + '</loc>\n';
    newsSitemap += '    <news:news>\n      <news:publication>\n';
    newsSitemap += '        <news:name>' + xmlEscape(PUBLICATION_NAME) + '</news:name>\n';
    newsSitemap += '        <news:language>hi</news:language>\n      </news:publication>\n';
    newsSitemap += '      <news:publication_date>' + item.published + '</news:publication_date>\n';
    newsSitemap += '      <news:title>' + xmlEscape(item.title) + '</news:title>\n';
    newsSitemap += '    </news:news>\n  </url>\n';
  }
  newsSitemap += '</urlset>\n';
  fs.writeFileSync('./news-sitemap.xml', newsSitemap, 'utf8');

  console.log('Generated sitemap.xml with ' + urlEntries.size + ' URLs.');
  console.log('Generated news-sitemap.xml with ' + recentNews.length + ' articles published in the last 48 hours.');
}

generateSitemap().catch(error => {
  console.error('Sitemap generation failed:', error.message);
  process.exitCode = 1;
});
