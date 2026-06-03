(function () {
  "use strict";

  if (!window.Matter) {
    return;
  }

  const {
    Engine,
    Render,
    Runner,
    Bodies,
    Body,
    Composite,
    Events,
    Vector,
  } = Matter;

  class DropMergeGame {
    constructor(options) {
      this.canvas = options.canvas;
      this.nextCanvas = options.nextCanvas;
      this.scoreNode = options.scoreNode;
      this.finalScoreNode = options.finalScoreNode;
      this.overlay = options.overlay;
      this.aim = options.aim;

      this.fruits = window.DROP_MERGE_FRUITS;
      this.score = 0;
      this.canDrop = true;
      this.gameOver = false;
      this.pendingMerge = new Set();
      this.pointerX = 0;
      this.nextLevel = this.randomStartLevel();
      this.warningSince = 0;

      this.engine = Engine.create();
      this.engine.gravity.y = 0.92;
      this.runner = Runner.create();
      this.render = Render.create({
        canvas: this.canvas,
        engine: this.engine,
        options: {
          wireframes: false,
          background: "transparent",
          pixelRatio: window.devicePixelRatio || 1,
        },
      });

      this.setupEvents();
      this.resize();
      this.reset();
      Render.run(this.render);
      Runner.run(this.runner, this.engine);
    }

    setupEvents() {
      Events.on(this.engine, "collisionStart", (event) => {
        for (const pair of event.pairs) {
          this.tryMerge(pair.bodyA, pair.bodyB);
        }
      });

      Events.on(this.engine, "afterUpdate", () => {
        this.checkGameOver();
      });

      Events.on(this.render, "afterRender", () => {
        this.drawWorldFruits();
      });
    }

    resize() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.width = Math.max(300, Math.floor(rect.width));
      this.height = Math.max(460, Math.floor(rect.height));
      this.dropY = Math.round(this.height * 0.1);
      this.deadLineY = Math.round(this.height * 0.13);

      this.render.options.width = this.width;
      this.render.options.height = this.height;
      if (Render.setSize) {
        Render.setSize(this.render, this.width, this.height);
      } else {
        this.canvas.width = this.width;
        this.canvas.height = this.height;
      }
      if (Render.setPixelRatio) {
        Render.setPixelRatio(this.render, window.devicePixelRatio || 1);
      }
      this.pointerX = this.pointerX || this.width / 2;

      this.rebuildBounds();
      this.updateAim(this.pointerX);
    }

    rebuildBounds() {
      if (this.bounds) {
        Composite.remove(this.engine.world, this.bounds);
      }

      const thickness = 48;
      const wallOptions = {
        isStatic: true,
        render: { fillStyle: "#263332" },
        friction: 0.9,
      };

      this.bounds = [
        Bodies.rectangle(this.width / 2, this.height + thickness / 2, this.width + thickness * 2, thickness, wallOptions),
        Bodies.rectangle(-thickness / 2, this.height / 2, thickness, this.height * 2, wallOptions),
        Bodies.rectangle(this.width + thickness / 2, this.height / 2, thickness, this.height * 2, wallOptions),
      ];
      Composite.add(this.engine.world, this.bounds);
    }

    reset() {
      Composite.clear(this.engine.world, false);
      this.bounds = null;
      this.rebuildBounds();
      this.score = 0;
      this.canDrop = true;
      this.gameOver = false;
      this.pendingMerge.clear();
      this.nextLevel = this.randomStartLevel();
      this.warningSince = 0;
      this.overlay.classList.add("is-hidden");
      this.updateScore();
      this.drawNext();
      this.updateAim(this.width / 2);
    }

    randomStartLevel() {
      const roll = Math.random();
      if (roll > 0.82) return 2;
      if (roll > 0.48) return 1;
      return 0;
    }

    updateAim(x) {
      const current = this.fruits[this.nextLevel];
      const margin = current.radius + 8;
      this.pointerX = Math.min(this.width - margin, Math.max(margin, x));
      this.aim.style.left = `${this.pointerX}px`;
    }

    drop() {
      if (!this.canDrop || this.gameOver) return;

      this.spawnFruit(this.nextLevel, this.pointerX, this.dropY);
      this.nextLevel = this.randomStartLevel();
      this.canDrop = false;
      this.drawNext();
      window.setTimeout(() => {
        this.canDrop = !this.gameOver;
      }, 520);
    }

    spawnFruit(level, x, y) {
      const fruit = this.fruits[level];
      const body = Bodies.circle(x, y, fruit.radius, {
        restitution: 0.08,
        friction: 0.52,
        frictionAir: 0.012,
        density: 0.0014,
        label: `fruit-${level}`,
        render: {
          fillStyle: fruit.color,
          strokeStyle: "#20302f",
          lineWidth: 2,
        },
      });
      body.plugin = { ...body.plugin, isFruit: true, level, bornAt: performance.now() };
      Composite.add(this.engine.world, body);
      return body;
    }

    tryMerge(a, b) {
      if (this.gameOver || !a.plugin?.isFruit || !b.plugin?.isFruit) return;
      if (a.plugin.level !== b.plugin.level) return;
      if (a.plugin.level >= this.fruits.length - 1) return;
      if (this.pendingMerge.has(a.id) || this.pendingMerge.has(b.id)) return;

      this.pendingMerge.add(a.id);
      this.pendingMerge.add(b.id);

      const level = a.plugin.level + 1;
      const x = (a.position.x + b.position.x) / 2;
      const y = (a.position.y + b.position.y) / 2;
      const impulse = Vector.mult(Vector.add(a.velocity, b.velocity), 0.22);

      window.requestAnimationFrame(() => {
        Composite.remove(this.engine.world, [a, b]);
        const merged = this.spawnFruit(level, x, y);
        Body.setVelocity(merged, impulse);
        this.score += this.fruits[level].score;
        this.updateScore();
        this.pendingMerge.delete(a.id);
        this.pendingMerge.delete(b.id);
      });
    }

    checkGameOver() {
      if (this.gameOver) return;
      const now = performance.now();
      const fruitBodies = Composite.allBodies(this.engine.world).filter((body) => body.plugin?.isFruit);
      const risky = fruitBodies.some((body) => {
        const age = now - body.plugin.bornAt;
        const slow = Math.abs(body.velocity.x) + Math.abs(body.velocity.y) < 0.18;
        return age > 1800 && slow && body.bounds.min.y < this.deadLineY;
      });

      if (risky) {
        this.warningSince ||= now;
      } else {
        this.warningSince = 0;
      }

      if (this.warningSince && now - this.warningSince > 1200) {
        this.endGame();
      }
    }

    endGame() {
      this.gameOver = true;
      this.canDrop = false;
      this.finalScoreNode.textContent = String(this.score);
      this.overlay.classList.remove("is-hidden");
    }

    updateScore() {
      this.scoreNode.textContent = String(this.score);
    }

    drawNext() {
      const canvas = this.nextCanvas;
      const context = canvas.getContext("2d");
      const fruit = this.fruits[this.nextLevel];
      const scale = Math.min(canvas.width, canvas.height) / (fruit.radius * 2.65);
      const radius = fruit.radius * scale;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      context.clearRect(0, 0, canvas.width, canvas.height);
      this.drawFruit(context, cx, cy, radius, fruit);
    }

    drawWorldFruits() {
      const context = this.render.context;
      const bodies = Composite.allBodies(this.engine.world);
      for (const body of bodies) {
        if (!body.plugin?.isFruit) continue;
        const fruit = this.fruits[body.plugin.level];
        if (!fruit) continue;
        this.drawFruit(context, body.position.x, body.position.y, body.circleRadius, fruit);
      }

      if (!this.gameOver && this.canDrop) {
        const fruit = this.fruits[this.nextLevel];
        context.save();
        context.globalAlpha = 0.72;
        this.drawFruit(context, this.pointerX, this.dropY, fruit.radius, fruit);
        context.restore();
      }
    }

    drawFruit(context, x, y, radius, fruit) {
      const gradient = context.createRadialGradient(x - radius * 0.35, y - radius * 0.45, radius * 0.1, x, y, radius);
      gradient.addColorStop(0, fruit.accent);
      gradient.addColorStop(0.58, fruit.color);
      gradient.addColorStop(1, "#263332");

      context.save();
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = gradient;
      context.fill();
      context.lineWidth = Math.max(1.5, radius * 0.08);
      context.strokeStyle = "#20302f";
      context.stroke();

      context.beginPath();
      context.arc(x - radius * 0.28, y - radius * 0.36, radius * 0.18, 0, Math.PI * 2);
      context.fillStyle = "rgba(255, 255, 255, 0.58)";
      context.fill();
      context.restore();
    }
  }

  window.DropMergeGame = DropMergeGame;
})();
