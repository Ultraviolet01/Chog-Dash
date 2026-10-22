/*
 * The new high score screen waits for a tap before the game over card. Tests that aren't about it add this to a page
 * (or context): whenever the screen is ready to continue, it taps through, as a player would.
 */
function skipHighScore(target) {
  return target.addInitScript(() => {
    setInterval(() => {
      const el = document.getElementById('hsScreen');
      if (el && el.classList.contains('ready') && !el.classList.contains('closing')) el.click();
    }, 100);
  });
}
module.exports = { skipHighScore };
