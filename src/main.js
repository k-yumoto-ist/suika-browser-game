(function () {
  "use strict";

  function boot() {
    const required = [
      ["canvas", document.getElementById("gameCanvas")],
      ["nextCanvas", document.getElementById("nextCanvas")],
      ["scoreNode", document.getElementById("score")],
      ["finalScoreNode", document.getElementById("finalScore")],
      ["overlay", document.getElementById("overlay")],
      ["aim", document.getElementById("aim")],
    ];

    if (!window.Matter) {
      document.body.innerHTML = '<main class="app"><p>Matter.js could not be loaded. Check the network connection and reload.</p></main>';
      return;
    }

    const options = Object.fromEntries(required);
    const game = new window.DropMergeGame(options);
    const board = options.canvas.parentElement;
    const modeButtons = Array.from(document.querySelectorAll("[data-render-mode]"));
    let lastDropAt = 0;

    function eventPoint(event) {
      return event.touches?.[0] || event.changedTouches?.[0] || event;
    }

    function boardRect() {
      return board.getBoundingClientRect();
    }

    function isInsideBoard(event) {
      const point = eventPoint(event);
      const rect = boardRect();
      return (
        point.clientX >= rect.left &&
        point.clientX <= rect.right &&
        point.clientY >= rect.top &&
        point.clientY <= rect.bottom
      );
    }

    function boardX(event) {
      const point = eventPoint(event);
      const rect = boardRect();
      return point.clientX - rect.left;
    }

    function moveAim(event) {
      game.updateAim(boardX(event));
    }

    function dropAt(event) {
      if (!isInsideBoard(event)) return;
      event.preventDefault();
      game.updateAim(boardX(event));
      const now = performance.now();
      if (now - lastDropAt < 120) return;
      lastDropAt = now;
      game.drop();
    }

    function moveInsideBoard(event) {
      if (isInsideBoard(event)) moveAim(event);
    }

    board.addEventListener("pointermove", moveAim);
    board.addEventListener("mousemove", moveAim);
    board.addEventListener("pointerdown", dropAt);
    board.addEventListener("mousedown", dropAt);
    board.addEventListener("click", dropAt);
    window.addEventListener("pointermove", moveInsideBoard, true);
    window.addEventListener("mousemove", moveInsideBoard, true);
    window.addEventListener("pointerdown", dropAt, true);
    window.addEventListener("mousedown", dropAt, true);
    window.addEventListener("click", dropAt, true);

    board.addEventListener(
      "touchmove",
      (event) => {
        event.preventDefault();
        moveAim(event);
      },
      { passive: false },
    );

    board.addEventListener("touchstart", dropAt, { passive: false });
    window.addEventListener("touchstart", dropAt, { capture: true, passive: false });

    window.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        game.drop();
      }
      if (event.key === "ArrowLeft") {
        game.updateAim(game.pointerX - 18);
      }
      if (event.key === "ArrowRight") {
        game.updateAim(game.pointerX + 18);
      }
    });

    document.getElementById("restartButton").addEventListener("click", () => game.reset());
    document.getElementById("overlayRestartButton").addEventListener("click", () => game.reset());

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.renderMode;
        game.setRenderMode(mode);
        modeButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      });
      button.classList.toggle("is-active", button.dataset.renderMode === game.renderMode);
    });

    window.addEventListener("resize", () => {
      game.resize();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
