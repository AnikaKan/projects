// Local stand-in for the Messages API (fixtures, not real Claude). Picks a reply from the request's context.
import { createServer } from 'node:http'
const seen = []
const reply = (r, body) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(body)) }
createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c
  if (req.url === '/__seen') return reply(res, seen)
  const j = JSON.parse(b)
  const user = j.messages[0].content
  const coach = user.match(/<coach_text>\n([\s\S]*?)\n<\/coach_text>/)
  if (coach) { // Coach View "simpler words": fixture rewording that keeps name and amounts (not real Claude output)
    seen.push({ path: req.url, auth: !!(req.headers['x-api-key'] || req.headers.authorization), model: j.model, format: j.output_config?.format?.type, coach: true })
    const text = /Language: simple Indian English/.test(user) ? 'In short: ' + coach[1].replace(/^Help /, 'help ') : coach[1]
    return reply(res, { id: 'msg_mock', type: 'message', role: 'assistant', model: j.model, content: [{ type: 'text', text: JSON.stringify({ text }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 300, output_tokens: 40 } })
  }
  const ctx = JSON.parse(user.match(/<lesson_context>\n([\s\S]*?)\n<\/lesson_context>/)[1])
  const words = (user.match(/<learner_words>\n([\s\S]*?)\n<\/learner_words>/) || [])[1]
  seen.push({ path: req.url, auth: !!(req.headers['x-api-key'] || req.headers.authorization), model: j.model, format: j.output_config?.format?.type, stage: ctx.lessonStage, lang: ctx.language, words })
  const R = (displayText, patch = {}) => ({ responseType: 'explanation', spokenText: displayText, displayText, conceptId: ctx.conceptId, requiresClarification: false, suggestedNextAction: 'continue', ...patch })
  let out
  if (ctx.lessonStage === 'example' && /Hindi/.test(ctx.language)) out = R('सोचिए, गल्ले में ₹500 आए। उसमें से ₹300 सुबह मंडी में सब्ज़ियों पर गए। आपके पास ₹200 बचे।')
  else if (ctx.lessonStage === 'example' && /Telugu/.test(ctx.language)) out = R('రోజంతా ₹600 వచ్చాయి. పాలు, టీ పొడి, చక్కెరకు ₹350 పోయాయి. మిగిలింది ₹250.')
  else if (ctx.lessonStage === 'example') out = R('Out of ₹500 in your cash box, ₹300 went back to the mandi this morning. ₹200 stays with you.')
  else if (ctx.lessonStage === 'response:feedback') out = R('₹500 is what customers gave you. ₹300 of it paid for the vegetables, so ₹500 − ₹300 = ₹250.', { suggestedNextAction: 'retry' }) // deliberately WRONG maths
  else if (words) out = R('Do you mean all the money customers gave you, or what stays after paying for the vegetables? Please choose one answer below.', { responseType: 'clarification', requiresClarification: true, suggestedNextAction: 'continue' })
  else out = R('Sales is all the money that comes in. Profit is what stays after paying for goods and other costs.')
  reply(res, { id: 'msg_mock', type: 'message', role: 'assistant', model: j.model, content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 80 } })
}).listen(8899, () => console.log('mock anthropic on 8899'))
