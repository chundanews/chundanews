const fs = require('fs');
const https = require('https');

const PROJECT_ID = 'chunda-news';
const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY;

function firestoreQuery(collection, field, value) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({structuredQuery:{from:[{collectionId:collection}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:value}}}}});
    const req=https.request('https://firestore.googleapis.com/v1/projects/'+PROJECT_ID+'/databases/(default)/documents:runQuery?key='+encodeURIComponent(FIREBASE_API_KEY||''),{method:'POST',headers:{'Content-Type':'application/json','Content-Length:Buffer.byteLength(body)}},res=>{let data='';res.on('data',d=>data+=d);res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(new Error('Firestore query failed: HTTP '+res.statusCode+' '+data));try{resolve(JSON.parse(data).filter(x=>x.document).map(x=>x.document));}catch(e){reject(e);}})});req.on('error',reject);req.write(body);req.end();});
}

function fromFirestoreFields(fields){const out={};for(const [k,v] of Object.entries(fields||{})){out[k]=v.timestampValue||v.stringValue||v.integerValue||v.doubleValue||v.booleanValue||v.arrayValue?.values||null;}return out;}
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
    if (!FIREBASE_API_KEY) throw new Error('FIREBASE_WEB_API_KEY is required.');
    const snapshot = await firestoreQuery('news_posts','published','true');

    snapshot.forEach((doc) => {
      const data = fromFirestoreFields(doc.fields);
      const articleId = encodeURIComponent(doc.id);
      const lastMod = getIsoDate(data.updatedAt || data.createdAt || data.publishedAt);

      xml += '  <url>\n';
      xml += '    <loc>' + DOMAIN + '/article.html?id=' + articleId + '</loc>\n';
      xml += '    <lastmod>' + lastMod + '</lastmod>\n';
      xml += '    <changefreq>daily</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';
    });

    const panchayatSnapshot = await firestoreQuery('panchayat_results','status','published');
    panchayatSnapshot.forEach((doc) => {
      const data = fromFirestoreFields(doc.fields);
      const params = new URLSearchParams({
        district: data.district || '',
        ps: data.panchayatSamiti || '',
        gp: data.gramPanchayat || '',
        village: data.village || '',
        ward: data.ward || ''
      });
      const lastMod = getIsoDate(data.updatedAt || data.verifiedAt || data.createdAt);
      xml += '  <url>\n';
      xml += '    <loc>' + DOMAIN + '/?' + params.toString() + '</loc>\n';
      xml += '    <lastmod>' + lastMod + '</lastmod>\n';
      xml += '    <changefreq>daily</changefreq>\n';
      xml += '    <priority>0.7</priority>\n';
      xml += '  </url>\n';
    });

    xml += '</urlset>\n';

    fs.writeFileSync('./sitemap.xml', xml, 'utf8');
    console.log('Sitemap generated successfully for news_posts and published panchayat_results.');
  } catch (error) {
    console.error('Error generating sitemap:', error);
    process.exitCode = 1;
  }
}

generateSitemap();