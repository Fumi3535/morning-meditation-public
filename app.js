'use strict';
const $ = id => document.getElementById(id);
const synth = window.speechSynthesis;
const cues = [
 [0, 'おはようございます。これから三分間、自分のための、静かな時間を過ごしましょう。楽な姿勢で、肩の力を、そっと抜きます。'],
 [25, '目は、閉じても、開けたままでも大丈夫です。いま、体が触れている場所を、感じてみましょう。'],
 [48, '息を、ゆっくり吸って。ゆっくり、吐きます。呼吸を変えようとせず、自然な流れに、気づいていきます。'],
 [75, 'いま、どんな気持ちがありますか。心地よさも、落ち着かなさも、そのままで大丈夫。答えを出す必要はありません。'],
 [103, '考えごとが浮かんだら、気づけた自分に、やさしく。そしてまた、ひとつの呼吸へ、戻りましょう。'],
 [133, '何もしなくてよい時間を、もう少しだけ。息を吐くたびに、肩や手の力を、ゆるめてみましょう。'],
 [157, '少しずつ、まわりの音に、意識を戻します。指先を、ゆっくり動かして。今日も、あなたのペースで。ありがとうございました。']
];
let voices = [], state = 'idle', elapsed = 0, origin = 0, nextCue = 0;
let currentCue = null, speaking = false, utterance = null, generation = 0;
let context, master, music, activeNodes = [];
let session = 0;
function loadVoices() {
 if (!synth) { $('voice-note').textContent = 'このブラウザーには読み上げ機能がありません。Safariで開いてください。'; $('play').disabled = $('sample').disabled = true; return; }
 const previous = $('voice').value;
 voices = synth.getVoices().filter(v => /^ja(?:[-_]|$)/i.test(v.lang));
 $('voice').replaceChildren();
 if (!voices.length) { $('voice').add(new Option('日本語の声を読み込み中／未インストール', '')); }
 voices.forEach((v, i) => $('voice').add(new Option(`${v.name}${v.localService ? '（端末内の声）' : '（処理方法は端末による）'}`, String(i))));
 if (voices[Number(previous)]) $('voice').value = previous;
 $('play').disabled = $('sample').disabled = !voices.length;
}
loadVoices();
if (synth) synth.addEventListener('voiceschanged', loadVoices);
window.addEventListener('focus', loadVoices);
function silence() {
 generation++; synth?.cancel(); speaking = false; utterance = null;
}
function say(text, done) {
 silence();
 const token = generation;
 utterance = new SpeechSynthesisUtterance(text);
 utterance.voice = voices[Number($('voice').value)]; utterance.lang = 'ja-JP';
 utterance.rate = Number($('rate').value); utterance.pitch = Number($('pitch').value); utterance.volume = Number($('voiceVolume').value);
 speaking = true;
 utterance.onend = () => { if (token !== generation) return; speaking = false; currentCue = null; done?.(); };
 utterance.onerror = event => {
  if (token !== generation || event.error === 'canceled' || event.error === 'interrupted') return;
  pause(); $('status').textContent = '声を再生できませんでした。別の声を選んで再開してください。';
 };
 synth.speak(utterance);
}
async function startMusic() {
 const Audio = window.AudioContext || window.webkitAudioContext;
 if (!Audio) throw new Error('audio unavailable');
 if (!context) {
  context = new Audio(); master = context.createGain(); master.gain.value = 0;
  const compressor = context.createDynamicsCompressor();
  master.connect(compressor); compressor.connect(context.destination);
  // Original, softly detuned sine pad; no samples, downloads or external music.
  [130.81, 196, 261.63, 329.63, 392].forEach((frequency, i) => {
   const oscillator = context.createOscillator(), gain = context.createGain();
   oscillator.type = 'sine'; oscillator.frequency.value = frequency; oscillator.detune.value = i % 2 ? 3 : -3;
   gain.gain.value = 0.055; oscillator.connect(gain); gain.connect(master); oscillator.start(); activeNodes.push(oscillator);
   const lfo = context.createOscillator(), depth = context.createGain();
   lfo.frequency.value = 0.055 + i * 0.009; depth.gain.value = 0.018;
   lfo.connect(depth); depth.connect(gain.gain); lfo.start(); activeNodes.push(lfo);
  });
 }
 await context.resume();
 master.gain.cancelScheduledValues(context.currentTime);
 master.gain.setTargetAtTime(Number($('musicVolume').value), context.currentTime, 0.4);
 music = true;
}
function muteMusic() {
 if (context && master) { master.gain.cancelScheduledValues(context.currentTime); master.gain.setTargetAtTime(0, context.currentTime, 0.04); }
 music = false;
}
function controls() {
 $('pause').disabled = state !== 'playing' && state !== 'sample';
 $('stop').disabled = state === 'idle';
 $('play').textContent = state === 'paused' ? '▶ 再開' : '▶ 瞑想をはじめる';
 $('play').disabled = state === 'playing' || !voices.length;
 $('sample').disabled = state === 'playing' || state === 'sample' || state === 'paused' || !voices.length;
 document.body.classList.toggle('playing', state === 'playing' || state === 'sample');
}
function updateTime() {
 const seconds = Math.min(180, Math.floor(elapsed));
 $('time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')} / 3:00`;
 $('progress').value = elapsed;
}
function stop(finished = false) {
 session++; silence(); muteMusic(); state = 'idle'; elapsed = 0; nextCue = 0; currentCue = null;
 controls(); updateTime(); $('status').textContent = finished ? '3分間、おつかれさまでした。' : '終了しました。また、好きなときに。';
 $('caption').textContent = '今日も、自分にやさしく。';
}
function pause() {
 if (state !== 'playing' && state !== 'sample') return;
 if (state === 'sample') { stop(); return; }
 elapsed = Math.min(180, (performance.now() - origin) / 1000);
 state = 'paused'; session++; silence(); muteMusic(); controls(); updateTime();
 $('status').textContent = '一時停止中です。再開すると、途中のガイドを読み直します。';
}
async function play() {
 if (!voices.length || state === 'playing') return;
 const resume = state === 'paused', token = ++session;
 try {
  // Both operations originate in the user's tap to satisfy Safari autoplay rules.
  const ready = startMusic();
  state = 'playing';
  if (!resume) { silence(); elapsed = 0; nextCue = 0; currentCue = null; }
  origin = performance.now() - elapsed * 1000;
  controls(); $('status').textContent = '声とBGMを再生しています。合間の静けさも、そのまま。';
  if (resume && currentCue !== null) say(cues[currentCue][1]);
  else if (!resume) { currentCue = 0; nextCue = 1; $('caption').textContent = cues[0][1]; say(cues[0][1]); }
  await ready;
  if (token !== session) { if (state !== 'playing' && state !== 'sample') muteMusic(); return; }
  if (document.hidden) pause();
 } catch { if (token === session) { stop(); $('status').textContent = '音を開始できませんでした。Safariで再度お試しください。'; } }
}
$('play').onclick = play; $('pause').onclick = pause; $('stop').onclick = () => stop();
$('sample').onclick = async () => {
 const token = ++session;
 try {
  const ready = startMusic(); state = 'sample'; controls();
  $('status').textContent = '声とBGMの同時試聴中です。';
  say('おはようございます。肩の力を、そっと抜いて。いまのあなたのままで、大丈夫です。', () => { stop(); $('status').textContent = '試聴が終わりました。声とBGMは一緒に聞こえましたか。'; });
  await ready;
  if (token !== session) { if (state !== 'playing' && state !== 'sample') muteMusic(); return; }
  if (document.hidden) pause();
 } catch { if (token === session) { stop(); $('status').textContent = '音を開始できませんでした。Safariでお試しください。'; } }
};
for (const id of ['voiceVolume','musicVolume','rate','pitch']) $(id).oninput = () => {
 const value = Number($(id).value);
 $(id+'-value').textContent = id.endsWith('Volume') ? `${Math.round(value*100)}%` : value.toFixed(2);
 if (id === 'musicVolume' && music) master.gain.setTargetAtTime(value, context.currentTime, 0.1);
};
setInterval(() => {
 if (state !== 'playing') return;
 elapsed = Math.min(180, (performance.now() - origin) / 1000); updateTime();
 if (elapsed >= 180) { stop(true); return; }
 if (!speaking && nextCue < cues.length && elapsed >= cues[nextCue][0]) {
  currentCue = nextCue++; $('caption').textContent = cues[currentCue][1]; say(cues[currentCue][1]);
 }
}, 200);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', () => { silence(); muteMusic(); });
