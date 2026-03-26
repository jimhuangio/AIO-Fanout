// Quick smoke-test for extractAIOSources against a real DataForSEO response.
// Run with: npx ts-node --project tsconfig.json src/main/fanout/extract.test.ts
// (or paste into node REPL after transpiling)

import { extractAIOSources, extractPAAQuestions } from './extract'

const SAMPLE: unknown = {"version":"0.1.20260311","status_code":20000,"status_message":"Ok.","tasks":[{"id":"03142115-1429-0139-0000-abcbf5bc9b98","status_code":20000,"status_message":"Ok.","result":[{"keyword":"how do you detect skin cancer early?","type":"organic","items":[{"type":"ai_overview","rank_group":1,"rank_absolute":1,"page":1,"position":"left","asynchronous_ai_overview":true,"items":[{"type":"ai_overview_element","position":"left","title":null,"text":null,"references":null},{"type":"ai_overview_element","position":"left","title":null,"text":"Detect skin cancer early by performing monthly self-exams...","references":[{"type":"ai_overview_reference","position":"left","source":"American Academy of Dermatology","domain":"www.aad.org","url":"https://www.aad.org/public/diseases/skin-cancer/how-can-i-tell-if-i-have-skin-cancer","title":"How can I tell if I have skin cancer?","text":"Skin cancer can appear in many different ways..."}]}],"references":[{"type":"ai_overview_reference","position":"right","source":"American Academy of Dermatology","domain":"www.aad.org","url":"https://www.aad.org/public/diseases/skin-cancer/how-can-i-tell-if-i-have-skin-cancer","title":"How can I tell if I have skin cancer?","text":"Skin cancer can appear in many different ways, including: * A changing mole * A dome-shaped growth * A scaly patch * A non-healing..."},{"type":"ai_overview_reference","position":"right","source":"Clarus Dermatology","domain":"clarusdermatology.com","url":"https://clarusdermatology.com/spot-skin-cancer-early-5-warning-signs/","title":"How to Spot Skin Cancer Early: 5 Signs Dermatologists Look For","text":"Some early warning signs of skin cancer include: * A changing mole"},{"type":"ai_overview_reference","position":"right","source":"YouTube","domain":"www.youtube.com","url":"https://www.youtube.com/watch?v=UnCUcFJJDSA&t=33","title":"Find skin cancer: How to perform a skin self-exam","text":"To perform a skin self-exam..."},{"type":"ai_overview_reference","position":"right","source":"Minnesota Oncology","domain":"www.mnoncology.com","url":"https://www.mnoncology.com/resources/blog/how-detect-skin-cancer","title":"How to Detect Skin Cancer - Minnesota Oncology","text":"Additionally, the following ABCDE rule is helpful..."},{"type":"ai_overview_reference","position":"right","source":"YouTube","domain":"www.youtube.com","url":"https://www.youtube.com/watch?v=PYbqzyVkfFg","title":"What to Expect: Skin Cancer Screening","text":"A skin cancer screening involves inquiring about personal and family history..."},{"type":"ai_overview_reference","position":"right","source":"QSD Dermatology","domain":"qsderm.com.au","url":"https://qsderm.com.au/skin-cancer-early-diagnosis/","title":"Skin cancer early diagnosis","text":"A medical expert, like a doctor, is best able to help you..."}]},{"type":"people_also_ask","rank_group":1,"rank_absolute":3,"items":[{"type":"people_also_ask_element","title":"How do I know if I caught skin cancer early?","expanded_element":[{"type":"people_also_ask_expanded_element","url":"https://www.mdanderson.org/cancer-types/skin-cancer/skin-cancer-symptoms.html","domain":"www.mdanderson.org","title":"9 Top Skin Cancer Symptoms & Signs | UT MD Anderson","description":"Early signs and symptoms\n A change in an existing mole or spot..."}]},{"type":"people_also_ask_element","title":"What is the 2 week rule for skin cancer?","expanded_element":[{"type":"people_also_ask_expanded_element","url":"https://www.royalmarsden.nhs.uk/information-gps/gp-resources/skin-cancer/skin-cancer-diagnosis","domain":"www.royalmarsden.nhs.uk","title":"Skin cancer: Diagnosis","description":"NICE Guideline: Refer people using a suspected cancer pathway referral..."}]},{"type":"people_also_ask_element","title":"What are the 5 warning signs of skin cancer?","expanded_element":[{"type":"people_also_ask_expanded_element","featured_title":"Five signs of skin cancer you should know","url":"https://www.brownhealth.org/be-well/skin-cancer-and-5-signs-watch","domain":"www.brownhealth.org","title":"Skin Cancer and 5 Signs to Watch For","description":"A flesh-colored or pearly bump that never goes away..."}]},{"type":"people_also_ask_element","title":"What are the 5 C's of skin cancer?","expanded_element":null}]}]}]}]}

const aioSources = extractAIOSources(SAMPLE)
const paaQuestions = extractPAAQuestions(SAMPLE)

console.log('=== AIO Sources ===')
console.log(`Count: ${aioSources.length}`)
aioSources.forEach(s => {
  console.log(`  [${s.position}] ${s.domainRoot} — ${s.url.slice(0, 60)}`)
  console.log(`       snippet: ${s.aioSnippet?.slice(0, 80) ?? 'null'}`)
})

console.log('\n=== PAA Questions ===')
console.log(`Count: ${paaQuestions.length}`)
paaQuestions.forEach(q => {
  console.log(`  [${q.position}] ${q.question}`)
})

// Assertions
const errors: string[] = []
if (aioSources.length !== 6) errors.push(`Expected 6 AIO sources, got ${aioSources.length}`)
if (aioSources[0]?.domainRoot !== 'aad.org') errors.push(`Expected aad.org at pos 1, got ${aioSources[0]?.domainRoot}`)
if (aioSources[1]?.domainRoot !== 'clarusdermatology.com') errors.push(`Expected clarusdermatology.com at pos 2, got ${aioSources[1]?.domainRoot}`)
if (aioSources[0]?.aioSnippet === null) errors.push('Expected non-null snippet for aad.org')
if (aioSources[5]?.domainRoot !== 'qsderm.com.au') errors.push(`Expected qsderm.com.au at pos 6, got ${aioSources[5]?.domainRoot}`)
if (paaQuestions.length !== 4) errors.push(`Expected 4 PAA questions, got ${paaQuestions.length}`)
if (paaQuestions[0]?.question !== 'How do I know if I caught skin cancer early?') errors.push('PAA question 1 mismatch')
if (paaQuestions[3]?.aiAnswer !== null) errors.push('PAA question 4 should have null aiAnswer')

if (errors.length === 0) {
  console.log('\n✓ All assertions passed')
} else {
  console.error('\n✗ Failures:')
  errors.forEach(e => console.error('  -', e))
  process.exit(1)
}
