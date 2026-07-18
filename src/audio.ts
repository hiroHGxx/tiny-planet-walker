/**
 * コード生成のBGMと環境音(Web Audio API)。
 * 音声ファイルは使わず、オルゴール風のメロディ・風・小鳥・夜の虫の音・足音を
 * すべてノードの合成で作る
 * (「すべての形・色・動き・光をコードで作る」という作品の方針に音も合わせる)。
 *
 * ブラウザの自動再生制限があるため、最初のキー入力かポインタ操作で
 * AudioContext を作り、そこから静かにフェードインする。
 * 右上の🔊ボタンでいつでもミュートできる(設定はlocalStorageに保存)。
 */

const STORAGE_KEY = 'tiny-planet-walker:muted';
/** 全体の音量(静かな星なので控えめにする) */
const MASTER_LEVEL = 0.5;
/** 足音の間隔(秒)。プレイヤーの歩行モーションのテンポに合わせる */
const STEP_INTERVAL = 0.34;

/** メロディの1拍の長さ(秒)。ゆったりした子守唄のテンポ */
const BEAT = 0.42;
/**
 * ループするBGMのメロディ。[MIDIノート番号, 拍数] の並びで、0は休符。
 * ハ長調ペンタトニック(ドレミソラ)だけで作った、上って下りる単純な節。
 * 最後まで鳴らすと先頭に戻って無限にループする。
 */
const MELODY: ReadonlyArray<readonly [number, number]> = [
  [76, 1], [79, 1], [81, 2], // ミ ソ ラー
  [79, 1], [76, 1], [74, 2], // ソ ミ レー
  [72, 1], [74, 1], [76, 1], [79, 1], // ド レ ミ ソ
  [74, 3], [0, 1], // レーー(休)
  [76, 1], [79, 1], [81, 2], // ミ ソ ラー
  [84, 1], [81, 1], [79, 2], // 高いド ラ ソー
  [76, 1], [74, 1], [72, 2], // ミ レ ドー
  [72, 3], [0, 1], // ドーー(休)
];

/** MIDIノート番号を周波数(Hz)にする */
function noteToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export interface AmbientAudio {
  /**
   * moving: プレイヤーが移動入力中か
   * sunElevation: プレイヤー地点での太陽の高さ(1=真昼、-1=真夜中)
   */
  update(deltaTime: number, moving: boolean, sunElevation: number): void;
}

export function createAmbientAudio(): AmbientAudio {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let melodyOut: GainNode | null = null;
  let windGain: GainNode | null = null;
  let windFilter: BiquadFilterNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;

  // メロディの予約状況(次に鳴らす音の開始時刻と、メロディ内の位置)
  let melodyIndex = 0;
  let nextNoteTime = 0;

  let muted = false;
  try {
    muted = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // 保存が使えない環境では毎回音ありで始まる
  }

  let elapsed = 0;
  let nextBirdAt = 3;
  let nextCricketAt = 3;
  let stepTimer = 0;

  // --- ミュートボタン(右上) ---
  const button = document.createElement('button');
  button.className = 'hud-button';
  button.id = 'audio-toggle';
  const refreshButton = () => {
    button.textContent = muted ? '🔇' : '🔊';
    button.title = muted ? '音を出す' : 'ミュートする';
  };
  refreshButton();
  (document.querySelector('#hud-buttons') ?? document.body).appendChild(button);
  button.addEventListener('click', () => {
    muted = !muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // 保存できなくてもその場では切り替わる
    }
    refreshButton();
  });

  /** 最初のユーザー操作でAudioContextを作る(自動再生制限への対応) */
  const unlock = () => {
    if (context) {
      // タブ切り替えなどで止められていたら起こす
      if (context.state === 'suspended') void context.resume();
      return;
    }
    try {
      context = new AudioContext();
    } catch {
      return; // Web Audio非対応の環境では音なしで遊べればよい
    }
    master = context.createGain();
    master.gain.value = 0; // updateの中でフェードインする
    master.connect(context.destination);

    // 風:低音寄りにならしたノイズをローパスに通して、メロディの下に薄く敷く
    noiseBuffer = createNoiseBuffer(context);
    const wind = context.createBufferSource();
    wind.buffer = noiseBuffer;
    wind.loop = true;
    windFilter = context.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 300;
    windFilter.Q.value = 0.4;
    windGain = context.createGain();
    windGain.gain.value = 0.12;
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();

    // BGMのメロディの出口。やわらかい残響(短いディレイの繰り返し)を添える
    melodyOut = context.createGain();
    melodyOut.gain.value = 1;
    melodyOut.connect(master);
    const echo = context.createDelay(1);
    echo.delayTime.value = BEAT * 1.5;
    const echoFeedback = context.createGain();
    echoFeedback.gain.value = 0.3;
    const echoTone = context.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 1800;
    melodyOut.connect(echo);
    echo.connect(echoTone).connect(echoFeedback).connect(echo);
    echoFeedback.connect(master);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  /** メロディの1音:オルゴール風に、基音+1オクターブ上を重ねて減衰させる */
  const playMelodyNote = (midi: number, start: number, duration: number) => {
    if (!context || !melodyOut) return;
    const frequency = noteToFrequency(midi);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.055, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0005, start + duration + 0.6);
    gain.connect(melodyOut);
    const tone = context.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = frequency;
    const shimmer = context.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = frequency * 2;
    const shimmerGain = context.createGain();
    shimmerGain.gain.value = 0.25;
    tone.connect(gain);
    shimmer.connect(shimmerGain).connect(gain);
    const end = start + duration + 0.7;
    tone.start(start);
    tone.stop(end);
    shimmer.start(start);
    shimmer.stop(end);
    tone.onended = () => gain.disconnect();
  };

  /** メロディを少し先まで予約する。ループの終わりまで来たら先頭へ戻る */
  const scheduleMelody = () => {
    if (!context) return;
    // ミュート明けやタブ復帰で予約時刻が過去になっていたら、今から仕切り直す
    if (nextNoteTime < context.currentTime) nextNoteTime = context.currentTime + 0.2;
    while (nextNoteTime < context.currentTime + 0.6) {
      const [midi, beats] = MELODY[melodyIndex]!;
      if (midi > 0) playMelodyNote(midi, nextNoteTime, beats * BEAT);
      nextNoteTime += beats * BEAT;
      melodyIndex = (melodyIndex + 1) % MELODY.length;
    }
  };

  /** 小鳥のさえずり:短く下がる音を2〜4回。左右にランダムに散らす */
  const birdChirp = () => {
    if (!context || !master) return;
    const start = context.currentTime + 0.02;
    const notes = 2 + Math.floor(Math.random() * 3);
    const pan = context.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    const gain = context.createGain();
    gain.gain.value = 0;
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.connect(gain).connect(pan).connect(master);
    for (let i = 0; i < notes; i++) {
      const t = start + i * (0.1 + Math.random() * 0.05);
      const freq = 2300 + Math.random() * 1000;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.06);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0006, t + 0.08);
    }
    osc.start(start);
    osc.stop(start + notes * 0.16 + 0.1);
    osc.onended = () => pan.disconnect();
  };

  /** 夜の虫の音:高い音を細かく刻むひと鳴き */
  const cricketChirp = () => {
    if (!context || !master) return;
    const start = context.currentTime + 0.02;
    const pulses = 6 + Math.floor(Math.random() * 10);
    const rate = 24 + Math.random() * 8; // 刻みの速さ(回/秒)
    const pan = context.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    const gain = context.createGain();
    gain.gain.value = 0;
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 4100 + Math.random() * 500;
    osc.connect(gain).connect(pan).connect(master);
    for (let i = 0; i < pulses; i++) {
      const t = start + i / rate;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.02, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0004, t + 0.03);
    }
    osc.start(start);
    osc.stop(start + pulses / rate + 0.1);
    osc.onended = () => pan.disconnect();
  };

  /** 足音:ノイズの一瞬だけをこもらせて鳴らす、草を踏むような音 */
  const footstep = () => {
    if (!context || !master || !noiseBuffer) return;
    const start = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.playbackRate.value = 0.85 + Math.random() * 0.3;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650 + Math.random() * 250;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.06, start);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.09);
    source.connect(filter).connect(gain).connect(master);
    source.start(start, Math.random() * 1.5, 0.12);
    source.onended = () => gain.disconnect();
  };

  return {
    update(deltaTime: number, moving: boolean, sunElevation: number): void {
      if (!context || !master) return;
      elapsed += deltaTime;

      // ミュートの切り替えと起動時は、急に切れないよう指数減衰でフェード
      const target = muted ? 0 : MASTER_LEVEL;
      master.gain.value += (target - master.gain.value) * (1 - Math.exp(-4 * deltaTime));

      // 風はメロディの邪魔をしない程度に、ゆっくり強弱をつけてそよがせる
      if (windGain && windFilter) {
        const gust =
          0.1 + 0.05 * Math.sin(elapsed * 0.31) + 0.03 * Math.sin(elapsed * 0.83 + 1.7);
        windGain.gain.value = Math.max(0.03, gust);
        windFilter.frequency.value =
          300 + 90 * Math.sin(elapsed * 0.17) - (sunElevation < 0 ? 60 : 0);
      }

      if (muted || context.state !== 'running') return;

      // BGMのメロディを絶やさないよう、常に少し先まで音を予約しておく
      scheduleMelody();

      // 昼は小鳥、夜は虫の音(どちらも間隔をランダムにゆらす)
      if (sunElevation > 0.12 && elapsed >= nextBirdAt) {
        birdChirp();
        nextBirdAt = elapsed + 2.5 + Math.random() * 8;
      }
      if (sunElevation < -0.08 && elapsed >= nextCricketAt) {
        cricketChirp();
        nextCricketAt = elapsed + 1.2 + Math.random() * 3.5;
      }

      // 足音:歩いている間、一定の歩調で小さく鳴らす
      if (moving) {
        stepTimer += deltaTime;
        if (stepTimer >= STEP_INTERVAL) {
          stepTimer -= STEP_INTERVAL;
          footstep();
        }
      } else {
        stepTimer = STEP_INTERVAL * 0.8; // 歩き出してすぐ最初の一歩が鳴る
      }
    },
  };
}

/** 風のもとになる2秒のノイズ(白色ノイズを弱くならして低音寄りにする) */
function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
    data[i] = Math.max(-1, Math.min(1, last * 6));
  }
  return buffer;
}
