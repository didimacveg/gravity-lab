# LinkedIn: gravity-lab

Three posts in English, one per week, after the RAAN and Syndrome Lab posts.
Each one stands on its own and has one idea.

| # | Date | Idea | Media |
|---|---|---|---|
| 1 | Tuesday 12 January 2027 | The simulator shows its own error against NASA | `post1-validation.png` |
| 2 | Tuesday 19 January 2027 | What the comparison found: a bug no test had caught | `post2-what-it-found.png` |
| 3 | Tuesday 26 January 2027 | Measuring Mercury's relativistic precession | `post3-mercury-precession.mp4` (or `post3-mercury.png`) |

Notes before publishing:

- Read each text and put it in your own voice. The numbers are checked
  against the test suite; the tone is a proposal.
- Publish only after the site is live at
  https://didimacveg.github.io/gravity-lab/ (see `docs/PASOS_PARA_DIEGO.md`).
- LinkedIn tends to show posts with a link in the body to fewer people. A
  common approach is to put the link in the first comment. Both versions
  work; the texts below end with the link so you can cut it.
- The images are 1080 x 1350. The video is 1080 x 1350, 20 seconds, 30 fps,
  H.264, no sound. `post3-video-poster.png` is its last frame, for the
  thumbnail.
- To regenerate everything from the app:
  `cd web && node ../tools/media/social.mjs`
- None of the texts uses a long dash.

---

## Post 1 · Tuesday 12 January 2027

**Image:** `post1-validation.png`

Orbit simulators in the browser are easy to build and easy to get subtly
wrong. The usual way to check one is to watch the energy stay constant. That
is not enough: a simulation can conserve energy and still put a planet in
the wrong place.

So for gravity-lab I asked a different question: where does NASA say the
planets are, and how far off am I?

The simulator starts from the JPL DE441 ephemeris at 1 January 2000 and then
runs on its own. Every 32 simulated days it compares each planet with the
JPL position and plots the difference.

After 100 years:

Mercury: 9 km
Venus: 4 km
Earth: 303 km
Mars: 32 km
Jupiter: 33 km
Saturn: 19 km
Uranus: 276 km
Neptune: 656 km

For scale, Mercury travels 150 billion km in that time.

The model is deliberately small: the Sun and eight planets as point masses,
Newtonian gravity, the first relativistic correction, and the averaged
effect of the Moon. The error that remains comes from what is missing
(asteroids, the Moon as a separate body), and the page says so.

Everything runs in the browser, and every number above is a test that runs
on each commit.

A note on how it was made: the code was written with AI assistance (Claude
Code), under my direction and review. What I care about is that every claim
can be checked by anyone.

Try it: https://didimacveg.github.io/gravity-lab/
Code and validation table: https://github.com/didimacveg/gravity-lab

#physics #astronomy #simulation #numericalmethods

---

## Post 2 · Tuesday 19 January 2027

**Image:** `post2-what-it-found.png`

The most useful thing about comparing a simulation with an external
reference is what it finds.

When gravity-lab was first checked against NASA/JPL Horizons, Mercury ended
a simulated century 1.66 million km from its real position. And it was worse
with general relativity switched on than without it.

Every test passed. Energy was conserved. The relativistic precession came
out right.

The cause was a single line. The integrator (a kick-drift-kick scheme)
assumes that the force depends only on position. The relativistic correction
also depends on velocity, and the code was evaluating it with a velocity
left over from the previous step. That breaks the time symmetry of the
method and quietly turns a fourth-order integrator into a first-order one.

The fix is to evaluate that term at the half-step velocity, which makes the
first kick an implicit equation. Two rounds of fixed-point iteration solve
it.

Mercury's error after 100 years:
Before: 1,660,000 km
After, same integrator: 35,607 km
After, with a sixth-order integrator: 9 km

The second surprise was the Moon. Treating Earth and Moon as a single point
put Earth 117 km further ahead every year. The Sun pulls on the two bodies
separately, and the average of that is not the pull on their midpoint.
Adding that term, with measured constants and nothing fitted, took Earth's
error from 11,686 km to 303 km.

Neither problem was visible from inside the simulation. Both were obvious
within minutes of looking at an outside reference.

Built with AI assistance (Claude Code) under my direction and review. The
regression tests for both fixes are in the repository.

https://github.com/didimacveg/gravity-lab

#physics #softwaretesting #numericalmethods #simulation

---

## Post 3 · Tuesday 26 January 2027

**Video:** `post3-mercury-precession.mp4` (alternative: `post3-mercury.png`)

In 1859 Le Verrier noticed that Mercury's orbit rotates slightly faster than
Newton's gravity allows. The gap was 43 arcseconds per century. It stayed
unexplained for 56 years, until Einstein's general relativity produced
exactly that number in 1915.

You can measure it in a browser tab.

gravity-lab runs two copies of the Solar System at once. One uses Newtonian
gravity. The other adds the first relativistic correction. Everything else
is identical, so everything else cancels: the pull of the other planets, the
error of the integrator. What is left is the angle between the two
perihelia, and it grows in a straight line.

The slope: 42.98 arcseconds per century.
Einstein's formula: 42.98.
Accepted value: 42.98.

The simulation does not contain that formula. It contains the force, and the
number is measured.

One detail I like. An earlier version of the project reported 42.81 and
called it a 0.4% error. It was not a numerical error. The code was measuring
the angle projected onto the plane of Earth's orbit, and Mercury's orbit is
tilted 7 degrees. Projecting a rotation onto a tilted plane slows it by a
factor of 0.996. Measured in the plane of the orbit, the textbook value
appears.

(In the video the angle is drawn 3,000 times larger than it is. The real one
after a century is about a hundredth of a degree.)

Built with AI assistance (Claude Code) under my direction and review, and
checked against NASA/JPL ephemerides.

Run the measurement yourself: https://didimacveg.github.io/gravity-lab/

#physics #generalrelativity #astronomy #simulation
