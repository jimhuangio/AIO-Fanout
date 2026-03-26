// Generates branded HTML output from project data or content briefs.
// Opened in the user's default browser; can be printed to PDF from there.
import type { ProjectMeta, ProjectStats, AIODomainPivotRow, TopicRow, TopicKeywordRow, ContentBrief } from '../../types'

export interface ReportData {
  meta: ProjectMeta
  stats: ProjectStats
  pivot: AIODomainPivotRow[]   // top domains × positions 1-10
  topics: { topic: TopicRow; keywords: TopicKeywordRow[]; elements: { sectionType: string; count: number }[]; schemas: { schemaType: string; count: number }[] }[]
  generatedAt: number
}

const INTENT_COLORS: Record<string, string> = {
  informational:  '#3b82f6',
  commercial:     '#d97706',
  transactional:  '#16a34a',
  navigational:   '#6b7280',
}

export function buildReportHTML(d: ReportData): string {
  const date = new Date(d.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const topDomains = d.pivot.slice(0, 25)

  const topicSections = d.topics.map(({ topic, keywords, elements, schemas }) => {
    const kwRows = keywords.map(kw => {
      const intentColor = kw.searchIntent ? (INTENT_COLORS[kw.searchIntent] ?? '#6b7280') : ''
      const intentBadge = kw.searchIntent
        ? `<span style="background:${intentColor}22;color:${intentColor};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:500;text-transform:capitalize;white-space:nowrap">${kw.searchIntent}</span>`
        : ''
      const vol = kw.searchVolume != null
        ? `<span style="color:#6b7280;font-size:11px">${kw.searchVolume.toLocaleString()}/mo</span>`
        : ''
      return `<tr>
        <td style="padding:5px 10px 5px 0;font-size:12px;color:#111">${kw.keyword}</td>
        <td style="padding:5px 10px;text-align:right">${vol}</td>
        <td style="padding:5px 0">${intentBadge}</td>
      </tr>`
    }).join('')

    const topDomainBadge = topic.topDomain
      ? `<span style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:2px 8px;font-size:11px;font-family:monospace">${topic.topDomain} ×${topic.topDomainCount}</span>`
      : '—'
    const bestDomainBadge = topic.bestDomain
      ? `<span style="background:#1d4ed8;color:#fff;border-radius:3px;padding:2px 6px;font-size:11px;font-weight:bold;margin-right:4px">${topic.bestDomainPosition}</span><span style="font-size:11px;font-family:monospace">${topic.bestDomain}</span>`
      : '—'

    const traffic = topic.totalSearchVolume != null
      ? topic.totalSearchVolume.toLocaleString() + '/mo'
      : '—'

    // ── Factors row ─────────────────────────────────────────────────────────
    // Intent distribution
    const intentCounts: Record<string, number> = {}
    for (const kw of keywords) {
      if (kw.searchIntent) intentCounts[kw.searchIntent] = (intentCounts[kw.searchIntent] ?? 0) + 1
    }
    const intentTotal = Object.values(intentCounts).reduce((s, n) => s + n, 0)
    const intentBars = Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([intent, n]) => {
        const pct = intentTotal > 0 ? Math.round((n / intentTotal) * 100) : 0
        const color = INTENT_COLORS[intent] ?? '#6b7280'
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <span style="font-size:10px;color:${color};text-transform:capitalize;width:80px;flex-shrink:0">${intent}</span>
          <div style="flex:1;background:#f3f4f6;border-radius:2px;overflow:hidden;height:8px">
            <div style="width:${pct}%;height:100%;background:${color};border-radius:2px"></div>
          </div>
          <span style="font-size:10px;color:#9ca3af;width:30px;text-align:right;flex-shrink:0">${pct}%</span>
        </div>`
      }).join('')
    const intentDistSection = intentTotal > 0
      ? `<div>
           <div style="font-size:9px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Search Intent Mix</div>
           ${intentBars}
         </div>`
      : ''

    // Top HTML element signal
    const topElement = elements[0]
    const totalMatches = elements.reduce((s, e) => s + e.count, 0)
    const topElementSection = topElement
      ? (() => {
          const pct = totalMatches > 0 ? Math.round((topElement.count / totalMatches) * 100) : 0
          const elementBars = elements.slice(0, 6).map(e => {
            const ep = totalMatches > 0 ? Math.round((e.count / totalMatches) * 100) : 0
            const tag = escHtml(e.sectionType)
            return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
              <span style="font-size:10px;font-family:monospace;color:#374151;width:72px;flex-shrink:0">&lt;${tag}&gt;</span>
              <div style="flex:1;background:#f3f4f6;border-radius:2px;overflow:hidden;height:8px">
                <div style="width:${ep}%;height:100%;background:#3b82f6;border-radius:2px"></div>
              </div>
              <span style="font-size:10px;color:#9ca3af;width:30px;text-align:right;flex-shrink:0">${ep}%</span>
            </div>`
          }).join('')
          return `<div>
            <div style="font-size:9px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">HTML Elements in AIO Snippets <span style="font-weight:400;text-transform:none;letter-spacing:0">(${totalMatches.toLocaleString()} matches)</span></div>
            ${elementBars}
            ${pct > 0 ? `<div style="margin-top:4px;font-size:10px;color:#6b7280">Dominant: <span style="font-family:monospace;color:#1d4ed8">&lt;${escHtml(topElement.sectionType)}&gt;</span> (${pct}% of snippet matches)</div>` : ''}
          </div>`
        })()
      : ''

    // Volume signal
    const kwWithVol = keywords.filter(k => k.searchVolume != null)
    const volumeSection = `<div>
      <div style="font-size:9px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Keyword Volume</div>
      <div style="font-size:20px;font-weight:700;color:#111;line-height:1">${traffic}</div>
      <div style="font-size:10px;color:#9ca3af;margin-top:4px">combined monthly search volume</div>
      <div style="font-size:10px;color:#9ca3af;margin-top:2px">${kwWithVol.length} of ${keywords.length} keywords have volume data</div>
    </div>`

    // Schema signal summary
    const schemaColors: Record<string, string> = {
      FAQPage:       '#7c3aed', HowTo: '#7c3aed',
      Article:       '#1d4ed8', NewsArticle: '#1d4ed8', BlogPosting: '#1d4ed8',
      WebPage:       '#0369a1', WebSite: '#0369a1',
      Organization:  '#0f766e', LocalBusiness: '#0f766e', Person: '#0f766e',
      Product:       '#b45309', Offer: '#b45309', ItemList: '#b45309',
      BreadcrumbList:'#6b7280', SiteLinksSearchBox: '#6b7280',
    }
    const schemaSignalSection = schemas.length > 0
      ? `<div>
           <div style="font-size:9px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Structured Data Signals</div>
           <div style="display:flex;flex-wrap:wrap;gap:4px">
             ${schemas.slice(0, 6).map(s => {
               const color = schemaColors[s.schemaType] ?? '#374151'
               return `<span style="background:${color}18;color:${color};border:1px solid ${color}44;border-radius:3px;padding:1px 6px;font-size:10px;font-weight:500;white-space:nowrap">${escHtml(s.schemaType)} <span style="opacity:0.6">×${s.count}</span></span>`
             }).join('')}
           </div>
         </div>`
      : ''

    const factorsRow = [volumeSection, intentDistSection, topElementSection, schemaSignalSection]
      .filter(Boolean)
      .map(s => `<div style="flex:1;min-width:160px">${s}</div>`)
      .join(`<div style="width:1px;background:#f3f4f6;flex-shrink:0"></div>`)

    const factorsSection = `
      <div style="padding:12px 16px;border-top:1px solid #e5e7eb;background:#fafafa">
        <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Analysis Factors</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">${factorsRow}</div>
      </div>`

    // Full element breakdown (detailed)
    const elementBarsDetailed = elements.slice(0, 8).map(e => {
      const pct = totalMatches > 0 ? Math.round((e.count / totalMatches) * 100) : 0
      const tag = escHtml(e.sectionType)
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:10px;font-family:monospace;color:#374151;width:72px;flex-shrink:0">&lt;${tag}&gt;</span>
        <div style="flex:1;background:#f3f4f6;border-radius:3px;overflow:hidden;height:12px">
          <div style="width:${pct}%;height:100%;background:#3b82f6;border-radius:3px"></div>
        </div>
        <span style="font-size:10px;color:#6b7280;width:32px;text-align:right;flex-shrink:0">${pct}%</span>
        <span style="font-size:10px;color:#9ca3af;width:36px;flex-shrink:0">${e.count.toLocaleString()}</span>
      </div>`
    }).join('')

    const topElementExplanation = (() => {
      if (!topElement || totalMatches === 0) return ''
      const pct = Math.round((topElement.count / totalMatches) * 100)
      const tag = topElement.sectionType.toLowerCase()
      const explanations: Record<string, string> = {
        h1: 'Pages cited in AI Overviews lead with a clear H1. Ensure your primary keyword appears in a single, prominent page title.',
        h2: 'H2 headings dominate AIO citations for this topic. Structure your content with descriptive H2s that directly address the search intent — Google\'s AI draws from heading-level sections most often.',
        h3: 'H3 subheadings are the most cited element. Organise supporting detail under clear H3s within each major section to increase snippet eligibility.',
        p:  'Paragraph prose is the primary citation source. Write substantive, well-structured paragraphs that answer questions directly and concisely.',
        li: 'List items are the dominant cited format. Present key information as scannable bullet or numbered lists — AI Overviews frequently pull from list-structured content.',
        blockquote: 'Blockquote/highlighted content performs well. Use pull quotes or highlighted statements to surface key claims clearly.',
      }
      const explanation = explanations[tag] ?? `<${tag}> elements are the most cited format. Ensure this element type contains clear, on-topic content.`
      return `<div style="margin-top:10px;padding:8px 12px;background:#eff6ff;border-radius:6px;border-left:3px solid #3b82f6">
        <span style="font-size:10px;font-weight:600;color:#1d4ed8">&lt;${escHtml(topElement.sectionType)}&gt; appears in ${pct}% of AIO snippet matches for this topic.</span>
        <span style="font-size:10px;color:#374151;display:block;margin-top:3px">${explanation}</span>
      </div>`
    })()

    const elementsSection = elements.length > 0
      ? `<div style="padding:10px 16px 12px;border-top:1px solid #f3f4f6">
           <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Best-Performing HTML Elements</div>
           ${elementBarsDetailed}
           ${topElementExplanation}
         </div>`
      : ''

    const schemaBadges = schemas.slice(0, 12).map(s => {
      const color = schemaColors[s.schemaType] ?? '#374151'
      return `<span style="display:inline-flex;align-items:center;gap:4px;background:${color}18;color:${color};border:1px solid ${color}44;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:500;white-space:nowrap">
        ${escHtml(s.schemaType)}<span style="opacity:0.6">×${s.count}</span>
      </span>`
    }).join('')

    const schemasSection = schemas.length > 0
      ? `<div style="padding:10px 16px 12px;border-top:1px solid #f3f4f6">
           <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Structured Data on Ranking Pages</div>
           <div style="display:flex;flex-wrap:wrap;gap:6px">${schemaBadges}</div>
         </div>`
      : ''

    return `
    <div style="break-inside:avoid;margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;align-items:baseline;gap:16px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:600;color:#111">${escHtml(topic.label)}</span>
        <span style="font-size:11px;color:#6b7280">${topic.memberCount} keywords</span>
        <span style="font-size:11px;color:#6b7280;margin-left:auto">Most shown: ${topDomainBadge}</span>
        <span style="font-size:11px;color:#6b7280">Highest rank: ${bestDomainBadge}</span>
      </div>
      ${factorsSection}
      <div style="padding:12px 16px">
        <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Keywords &amp; Search Volume</div>
        <table style="width:100%;border-collapse:collapse">
          <tr style="border-bottom:1px solid #f3f4f6">
            <th style="padding:3px 10px 3px 0;font-size:10px;font-weight:600;color:#9ca3af;text-align:left">Keyword</th>
            <th style="padding:3px 10px;font-size:10px;font-weight:600;color:#9ca3af;text-align:right">Volume/mo</th>
            <th style="padding:3px 0;font-size:10px;font-weight:600;color:#9ca3af;text-align:left">Intent</th>
          </tr>
          ${kwRows || '<tr><td style="color:#9ca3af;font-size:12px;padding:4px 0">No keywords loaded</td></tr>'}
        </table>
      </div>
      ${elementsSection}
      ${schemasSection}
    </div>`
  }).join('')

  const positionHeaders = [1,2,3,4,5,6,7,8,9,10].map(p =>
    `<th style="${thStyle}text-align:center">Pos ${p}</th>`
  ).join('')

  const domainRows = topDomains.map(row => {
    const cells = [row.pos1,row.pos2,row.pos3,row.pos4,row.pos5,row.pos6,row.pos7,row.pos8,row.pos9,row.pos10].map(v => {
      const heat = Math.min(v / Math.max(row.totalAppearances, 1), 1)
      const bg = heat > 0.5 ? '#1d4ed8' : heat > 0.2 ? '#3b82f6' : heat > 0 ? '#bfdbfe' : 'transparent'
      const color = heat > 0.2 ? '#fff' : heat > 0 ? '#1e40af' : '#d1d5db'
      return `<td style="padding:5px 8px;text-align:center;background:${bg};color:${color};font-size:11px;font-weight:${v > 0 ? 600 : 400}">${v > 0 ? v : '—'}</td>`
    }).join('')
    return `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:6px 10px 6px 0;font-size:12px;font-family:monospace;color:#111;white-space:nowrap">${escHtml(row.domain)}</td>
      <td style="padding:6px 10px;text-align:right;font-size:11px;font-weight:600;color:#1d4ed8">${row.visibilityScore.toLocaleString()}</td>
      ${cells}
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AIO Audit Report — ${escHtml(d.meta.name)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;background:#fff;font-size:13px;line-height:1.5}
  @media print{body{padding:0}.no-print{display:none}@page{margin:20mm}}
</style>
</head>
<body style="max-width:1100px;margin:0 auto;padding:40px 32px">

  <!-- Header -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #111">
    <div>
      <div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Tombo Group · AIO Audit Tool</div>
      <h1 style="font-size:24px;font-weight:700;color:#111;margin-bottom:4px">${escHtml(d.meta.name)}</h1>
      <div style="font-size:12px;color:#6b7280">Generated ${date} · ${escHtml(locationLabel(d.meta.locationCode))} · ${escHtml(d.meta.languageCode.toUpperCase())} · ${escHtml(d.meta.device)}</div>
    </div>
  </div>

  <!-- Summary stats -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:36px">
    ${statCard('Total Keywords', d.stats.totalKeywords.toLocaleString(), '#111')}
    ${statCard('Keywords with AIO', d.stats.keywordsWithAIO.toLocaleString(), '#1d4ed8')}
    ${statCard('Unique AIO Domains', d.stats.uniqueDomains.toLocaleString(), '#111')}
    ${statCard('Errors', d.stats.errorKeywords.toLocaleString(), d.stats.errorKeywords > 0 ? '#dc2626' : '#6b7280')}
  </div>

  <!-- AIO Domain Visibility -->
  <h2 style="font-size:15px;font-weight:600;color:#111;margin-bottom:12px">AIO Domain Visibility</h2>
  <p style="font-size:11px;color:#6b7280;margin-bottom:12px">Visibility score = Σ(11 − position) across all appearances. Top 25 domains shown.</p>
  <div style="overflow-x:auto;margin-bottom:40px;border:1px solid #e5e7eb;border-radius:8px">
    <table style="width:100%;border-collapse:collapse;min-width:700px">
      <thead>
        <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
          <th style="${thStyle}text-align:left">Domain</th>
          <th style="${thStyle}text-align:right">Score</th>
          ${positionHeaders}
        </tr>
      </thead>
      <tbody>${domainRows || '<tr><td colspan="12" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">No AIO data yet</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Topic Clusters -->
  <h2 style="font-size:15px;font-weight:600;color:#111;margin-bottom:4px">Topic Clusters</h2>
  <p style="font-size:11px;color:#6b7280;margin-bottom:16px">${d.topics.length} clusters · ${d.stats.totalKeywords.toLocaleString()} total keywords</p>
  ${topicSections || '<p style="color:#9ca3af;font-size:12px">No clusters yet. Run clustering in the app first.</p>'}

  <!-- Footer -->
  <div style="margin-top:48px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
    AIO Audit Tool by Tombo Group · tombogroup.com
  </div>

</body>
</html>`
}

const thStyle = 'padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;white-space:nowrap;'

function statCard(label: string, value: string, color: string): string {
  return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px">
    <div style="font-size:11px;color:#6b7280;margin-bottom:4px">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${color}">${value}</div>
  </div>`
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

export function buildBriefHTML(topicLabel: string, brief: ContentBrief, keywords: TopicKeywordRow[] = []): string {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const kwTableRows = keywords
    .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
    .map(kw => {
      const intentColor = kw.searchIntent ? (INTENT_COLORS[kw.searchIntent] ?? '#6b7280') : ''
      const intentBadge = kw.searchIntent
        ? `<span style="background:${intentColor}22;color:${intentColor};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:500;text-transform:capitalize">${kw.searchIntent}</span>`
        : '—'
      const vol = kw.searchVolume != null
        ? kw.searchVolume.toLocaleString()
        : '—'
      return `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:5px 12px 5px 0;font-size:12px;color:#111;font-family:monospace">${escHtml(kw.keyword)}</td>
        <td style="padding:5px 12px;text-align:right;font-size:12px;color:#6b7280;white-space:nowrap">${vol}</td>
        <td style="padding:5px 0">${intentBadge}</td>
      </tr>`
    }).join('')

  const kwSection = keywords.length > 0
    ? `<h2 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">Keywords &amp; Search Volume</h2>
       <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px">
         <table style="width:100%;border-collapse:collapse">
           <thead>
             <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
               <th style="padding:7px 12px 7px 0;font-size:10px;font-weight:600;color:#9ca3af;text-align:left;text-transform:uppercase;letter-spacing:0.05em">Keyword</th>
               <th style="padding:7px 12px;font-size:10px;font-weight:600;color:#9ca3af;text-align:right;text-transform:uppercase;letter-spacing:0.05em">Volume/mo</th>
               <th style="padding:7px 0;font-size:10px;font-weight:600;color:#9ca3af;text-align:left;text-transform:uppercase;letter-spacing:0.05em">Intent</th>
             </tr>
           </thead>
           <tbody style="padding:0 16px">${kwTableRows}</tbody>
         </table>
       </div>`
    : ''

  const keyTopicsHTML = brief.keyTopics.length > 0
    ? `<ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px">
        ${brief.keyTopics.map(t => `<li style="display:flex;gap:8px;font-size:13px;color:#374151"><span style="color:#3b82f6;margin-top:2px;flex-shrink:0">•</span>${escHtml(t)}</li>`).join('')}
       </ul>`
    : ''

  const outlineHTML = brief.outline.map(section => `
    <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:12px;break-inside:avoid">
      <div style="background:#f9fafb;padding:10px 16px;border-bottom:1px solid #e5e7eb">
        <span style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-right:8px">H2</span>
        <span style="font-size:14px;font-weight:600;color:#111">${escHtml(section.heading)}</span>
      </div>
      ${section.keyPoints.length > 0 ? `
      <ul style="margin:0;padding:10px 16px;list-style:none;display:flex;flex-direction:column;gap:4px">
        ${section.keyPoints.map(pt => `<li style="display:flex;gap:8px;font-size:12px;color:#4b5563"><span style="color:#d1d5db;flex-shrink:0">–</span>${escHtml(pt)}</li>`).join('')}
      </ul>` : ''}
    </div>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Content Brief — ${escHtml(topicLabel)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;background:#fff;font-size:13px;line-height:1.5}
  @media print{body{padding:0}.no-print{display:none}@page{margin:20mm}}
</style>
</head>
<body style="max-width:800px;margin:0 auto;padding:40px 32px">

  <!-- Header -->
  <div style="margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #111">
    <div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Tombo Group · AIO Audit Tool · Content Brief</div>
    <h1 style="font-size:24px;font-weight:700;color:#111;margin-bottom:4px">${escHtml(topicLabel)}</h1>
    <div style="font-size:12px;color:#6b7280">Generated ${date}</div>
  </div>

  <!-- Recommended H1 -->
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin-bottom:24px">
    <div style="font-size:10px;font-weight:600;color:#3b82f6;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">Recommended H1</div>
    <div style="font-size:18px;font-weight:600;color:#111">${escHtml(brief.h1)}</div>
  </div>

  <!-- Meta cards -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px">
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px">
      <div style="font-size:10px;color:#9ca3af;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">Target Audience</div>
      <div style="font-size:13px;font-weight:500;color:#111">${escHtml(brief.targetAudience)}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px">
      <div style="font-size:10px;color:#9ca3af;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">Content Type</div>
      <div style="font-size:13px;font-weight:500;color:#111">${escHtml(brief.contentType)}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px">
      <div style="font-size:10px;color:#9ca3af;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">Word Count</div>
      <div style="font-size:13px;font-weight:500;color:#111">${escHtml(brief.wordCount)}</div>
    </div>
  </div>

  <!-- Keywords -->
  ${kwSection}

  <!-- Key Topics -->
  ${keyTopicsHTML ? `
  <h2 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">Key Topics to Cover</h2>
  <div style="margin-bottom:28px">${keyTopicsHTML}</div>` : ''}

  <!-- Outline -->
  ${outlineHTML ? `
  <h2 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">Content Outline</h2>
  <div style="margin-bottom:40px">${outlineHTML}</div>` : ''}

  <!-- Footer -->
  <div style="margin-top:48px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
    AIO Audit Tool by Tombo Group · tombogroup.com
  </div>

</body>
</html>`
}

function locationLabel(code: number): string {
  const map: Record<number, string> = {
    2840:'United States', 2826:'United Kingdom', 2036:'Australia',
    2124:'Canada', 2276:'Germany', 2250:'France', 2724:'Spain',
    2380:'Italy', 2528:'Netherlands', 2702:'Singapore'
  }
  return map[code] ?? String(code)
}
