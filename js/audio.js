/* AudioFX - 程序化音效 */
window.AudioFX = {
  ctx: null, enabled: true, userUnlocked: false,
  init(){
    if(this.ctx) return;
    try {
      this.ctx = new (window.AudioContext||window.webkitAudioContext)();
    } catch(e){ this.enabled=false; }
  },
  _beep(opts){
    if(!this.enabled) return;
    this.init();
    if(!this.ctx) return;
    if(this.ctx.state==='suspended') this.ctx.resume();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = opts.type||'sine';
    o.connect(g); g.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    o.frequency.setValueAtTime(opts.f1||440, now);
    if(opts.f2) o.frequency.exponentialRampToValueAtTime(opts.f2, now+(opts.dur||0.1));
    g.gain.setValueAtTime(opts.gain||0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now+(opts.dur||0.1));
    o.start(now);
    o.stop(now+(opts.dur||0.15));
  },
  play(type){
    if(!this.enabled) return;
    switch(type){
      case 'shoot': this._beep({type:'square',f1:600,f2:200,dur:0.08,gain:0.12}); break;
      case 'hit': this._beep({type:'triangle',f1:300,f2:80,dur:0.12,gain:0.15}); break;
      case 'explode': this._beep({type:'sawtooth',f1:180,f2:40,dur:0.25,gain:0.25}); break;
      case 'place': this._beep({type:'sine',f1:500,f2:800,dur:0.1,gain:0.12}); break;
      case 'coin': this._beep({type:'sine',f1:900,f2:1400,dur:0.08,gain:0.1}); break;
      case 'levelup':
        this._beep({type:'sine',f1:400,f2:600,dur:0.08,gain:0.15});
        setTimeout(()=>this._beep({type:'sine',f1:600,f2:900,dur:0.12,gain:0.15}),80);
        break;
      case 'chip': this._beep({type:'triangle',f1:700,f2:1400,dur:0.15,gain:0.14}); break;
      case 'hurt': this._beep({type:'square',f1:120,f2:40,dur:0.2,gain:0.2}); break;
      case 'click': this._beep({type:'sine',f1:800,dur:0.04,gain:0.08}); break;
      case 'achievement':
        this._beep({type:'triangle',f1:500,f2:700,dur:0.1,gain:0.18});
        setTimeout(()=>this._beep({type:'triangle',f1:700,f2:1000,dur:0.12,gain:0.18}),90);
        setTimeout(()=>this._beep({type:'triangle',f1:1000,f2:1400,dur:0.2,gain:0.18}),190);
        break;
      case 'wave':
        this._beep({type:'square',f1:300,f2:500,dur:0.12,gain:0.18});
        setTimeout(()=>this._beep({type:'square',f1:500,f2:700,dur:0.12,gain:0.18}),140);
        break;
      case 'gameover': this._beep({type:'sawtooth',f1:300,f2:80,dur:0.6,gain:0.25}); break;
      case 'win':
        [523,659,784,1047].forEach((f,i)=>setTimeout(()=>this._beep({type:'triangle',f1:f,dur:0.2,gain:0.18}),i*120));
        break;
    }
  }
};
document.addEventListener('click',()=>{AudioFX.userUnlocked=true;AudioFX.init();},{once:true});
document.addEventListener('keydown',()=>{AudioFX.userUnlocked=true;AudioFX.init();},{once:true});
console.log('AudioFX ready');
