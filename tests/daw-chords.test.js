const {test}=require('node:test'),assert=require('node:assert/strict');
const {identify,Tracker}=require('../daw-chords');
const notes=(pitches,channel=1)=>pitches.map(pitch=>({pitch,channel}));
test('recognises common chords, extensions and inversions with octave doubling',()=>{
 for(const [pitches,label] of [[[60,64,67],'C'],[[60,63,67,70],'Cm7'],[[54,58,61],'F♯'],[[60,64,69],'Am/C'],[[60,64,67,71,74],'Cmaj9'],[[48,60,64,67,72],'C'],[[60,63,66,70],'Cm7♭5']])assert.equal(identify(notes(pitches)).label,label);
});
test('filters by channel, uses the lowest note for bass and falls back for unknown sets',()=>{
 const mixed=[...notes([69,60,64],2),...notes([61,66,70],1)];assert.equal(identify(mixed,2).label,'Am/C');
 assert.equal(identify(notes([60,61,66])).kind,'notes');assert.equal(identify(notes([60])).label,'C');assert.equal(identify([],2).label,'—');
});
test('settles staggered note arrivals and holds through short note-off gaps',()=>{
 const tracker=new Tracker();assert.equal(tracker.update(notes([60]),0).label,'—');tracker.update(notes([60,64]),40);tracker.update(notes([60,64,67]),80);
 assert.equal(tracker.update(notes([60,64,67]),209).label,'—');assert.equal(tracker.update(notes([60,64,67]),210).label,'C');
 tracker.update([],300);assert.equal(tracker.update([],500).label,'C');assert.equal(tracker.update([],580).label,'—');
 tracker.update(notes([60,63,67]),600);assert.equal(tracker.update(notes([60,63,67]),730).label,'Cm');tracker.reset();assert.equal(tracker.value.label,'—');
});
test('bass inversion changes settle while octave doubling does not reset the timer',()=>{
 const tracker=new Tracker();tracker.update(notes([60,64,67]),0);assert.equal(tracker.update(notes([48,60,64,67]),130).label,'C');
 tracker.update(notes([52,60,67]),200);assert.equal(tracker.update(notes([52,60,67]),330).label,'C/E');
});
