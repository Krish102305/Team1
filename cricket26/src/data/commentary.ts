// Placeholders: {b} batter, {bw} bowler, {f} fielder, {shot}, {r} runs, {team}
export const LINES: Record<string, string[]> = {
  runup: [
    '{bw} runs in...', '{bw} charges in from the far end.', 'Here comes {bw}.', '{bw} steams in.', '{bw} approaches the crease.',
    'In comes {bw} again.', '{bw} to {b}.', 'The field is set, {bw} runs in.',
  ],
  dot: [
    'Good ball, no run.', 'Dot ball. Tight from {bw}.', 'Nothing doing there.', 'Straight to the fielder, no run.',
    'Well bowled, {b} can\'t get it away.', 'Pressure building with another dot.', 'A beautiful delivery outside off stump.',
    'Solid stuff, but no run.', 'Played to the infield, they stay put.',
  ],
  defend: [
    'Solid forward defence from {b}.', 'Dead bat, smothered.', 'Blocked back to the bowler.', 'Watchful from {b}, plays it late and soft.',
    'Gets right behind the line. Textbook.', 'Defended with soft hands.', 'Respect shown to a good delivery.',
  ],
  leave: [
    'Left alone outside off.', '{b} shoulders arms.', 'Good leave, it carries through to the keeper.', 'Lets it go. Judgement on show.',
    'No shot offered.', 'Watched it all the way past the off stump.',
  ],
  beaten: [
    'Beaten! Past the outside edge!', 'Played and missed!', 'Oh, that\'s a jaffa! Beat the bat completely.', 'Swing and a miss!',
    'Too good for {b}!', '{bw} has beaten him there!', 'Lovely delivery, whistles past the edge.',
  ],
  single: [
    'Pushed away for a single.', 'A quick single, excellent running between the wickets.', 'Tucked off the pads for one.',
    'Dabbed into the gap, they scamper through.', 'Easy single to rotate the strike.', 'Worked away for one.', 'Nudged and they run.',
  ],
  two: [
    'They come back for two!', 'Placed in the gap, good running, two runs.', 'Two more to the total.', 'Hard running, they get a couple.',
    'Driven into the deep, back for the second.', 'Excellent running, two taken.',
  ],
  three: [
    'They\'re going for three! And they make it!', 'Three runs, superb running between the wickets.', 'Chased down just inside the rope, three taken.',
  ],
  four: [
    'FOUR! Straight down the ground, and it races away!', 'That\'s a lovely {shot}! Four runs!', 'Pierced the gap, nobody will stop that. FOUR!',
    'Cracking shot! Hit with authority to the fence.', 'Timed to perfection, that\'s four.', 'FOUR! Beautifully placed by {b}.',
    'Shot! That\'s one of the best of the day.', 'Whips it away, the fielder gives chase in vain. FOUR!', 'Like a tracer bullet to the boundary!',
    'Classy! {b} makes that look easy.',
  ],
  six: [
    'That\'s gone all the way! What a shot!', 'SIX! Into the stands!', 'MAXIMUM! {b} has absolutely smoked that!',
    'Huge! That has gone miles!', 'Launched! Out of the ground almost!', 'SIX! Clean as a whistle from {b}.',
    'Up, up and away... that\'s SIX!', 'Massive hit! The crowd is on its feet!', 'Into the second tier! What power!',
  ],
  highInAir: ['High in the air!', 'Up in the air...', 'Skied!', 'That\'s gone straight up!', 'In the air... is there a fielder?'],
  caught: [
    'CAUGHT! A massive breakthrough!', 'Taken! {f} makes no mistake.', 'Straight down the throat of {f}! Gone!', 'CAUGHT! {b} has to go.',
    'Holds on! Great catch by {f}!', 'Picked out the fielder. {b} departs.',
  ],
  caughtBehind: ['Edged and taken! {f} behind the stumps does the rest.', 'Nicked off! Big wicket for {bw}.', 'There\'s the edge... and it\'s taken!', 'Feather edge, safe hands from {f}!'],
  caughtAndBowled: ['Caught and bowled! {bw} takes a sharp return catch!', 'Straight back to {bw}, and he holds on!'],
  bowled: [
    'BOWLED HIM! Timber!', 'Clean bowled! The stumps are shattered!', 'Through the gate! {b} is bowled!', 'BOWLED! What a delivery from {bw}!',
    'Castled! The off stump is cartwheeling!', 'Knocked him over! {bw} is pumped!',
  ],
  playedOn: ['Dragged on! {b} plays it onto his own stumps!', 'Inside edge onto the stumps! Unlucky for {b}.'],
  lbw: ['Big appeal... and the finger goes up! LBW!', 'Trapped in front! {b} is out LBW.', 'Plumb! That was hitting middle.', 'LBW! Pinned on the crease.'],
  lbwNotOut: ['Big appeal for LBW... not out says the umpire.', 'Loud shout, but turned down.', 'Struck on the pad, the umpire is unmoved.'],
  runout: ['RUN OUT! Brilliant fielding!', 'He\'s short of his ground! Run out!', 'Direct hit! He\'s gone!', 'Mix-up in the middle, and it\'s a run out!'],
  stumped: ['STUMPED! Lightning work from {f}!', 'Down the track, beaten, and stumped!', 'Out of his crease and {f} whips the bails off!'],
  hitwicket: ['Oh no! He\'s trodden on his stumps! Hit wicket!', 'Hit wicket! {b} disturbs the bails with the bat.'],
  dropped: ['DROPPED! {f} puts it down!', 'Chance goes begging! Dropped!', 'Oh, he\'s spilled it! Lifeline for {b}.', 'Can\'t hold on! That should have been taken.'],
  wide: ['Wide called.', 'Too wide, the umpire stretches the arms.', 'Strays down the leg side. Wide.', 'That\'s a wide, extra run.'],
  noball: ['No ball! Overstepped.', 'No ball! Free hit coming up.', 'The umpire signals no ball.'],
  byes: ['They steal a bye.', 'Byes taken, the keeper couldn\'t gather.', 'Runs as byes.'],
  legbyes: ['Off the pads, leg byes.', 'Leg bye taken.', 'Deflects off the pad and they run.'],
  misfield: ['Fumbled in the field!', 'Misfield! That will annoy the captain.', 'Slips through the fielder\'s hands!'],
  directHit: ['Direct hit! But he\'s made his ground.', 'Throws down the stumps, safe though.'],
  overthrow: ['Overthrows! Nobody backing up!', 'Wild throw, and they take extra.'],
  edgeSafe: ['Edged! Falls safe.', 'Thick edge, but it flies wide of the fielders.', 'Outside edge... runs away.', 'Streaky, but they count.'],
  overComplete: ['That\'s the end of the over.', 'End of the over.', 'Over complete.'],
  maiden: ['A maiden over! Superb from {bw}.', 'Maiden! Outstanding control.'],
  yorker: ['Searing yorker!', 'Right in the blockhole!', 'Toe-crusher of a yorker.'],
  bouncer: ['Bouncer! Ducks under it.', 'Short and quick, sways out of the way.', 'Bumper, well evaded.'],
  freeHit: ['FREE HIT! Only a run out can dismiss him.'],
};
