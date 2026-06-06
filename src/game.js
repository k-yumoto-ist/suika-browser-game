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
      this.currentLevel = this.randomStartLevel();
      this.nextLevel = this.randomStartLevel();
      this.warningSince = 0;
      this.renderMode = window.localStorage.getItem("dropMergeRenderMode") || "simple";

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
      this.currentLevel = this.randomStartLevel();
      this.nextLevel = this.randomStartLevel();
      this.warningSince = 0;
      this.overlay.classList.add("is-hidden");
      this.updateScore();
      this.drawNext();
      this.updateAim(this.width / 2);
    }

    randomStartLevel() {
      const roll = Math.random();
      let level = 0;
      if (roll > 0.93) level = 4;
      else if (roll > 0.8) level = 3;
      else if (roll > 0.6) level = 2;
      else if (roll > 0.35) level = 1;
      return level;
    }

    updateAim(x) {
      const current = this.fruits[this.currentLevel];
      const margin = current.radius + 8;
      this.pointerX = Math.min(this.width - margin, Math.max(margin, x));
      this.aim.style.left = `${this.pointerX}px`;
    }

    drop() {
      if (!this.canDrop || this.gameOver) return;

      this.spawnFruit(this.currentLevel, this.pointerX, this.dropY);
      this.currentLevel = this.nextLevel;
      this.nextLevel = this.randomStartLevel();
      this.canDrop = false;
      this.drawNext();
      this.updateAim(this.pointerX);
      window.setTimeout(() => {
        this.canDrop = !this.gameOver;
      }, 520);
    }

    setRenderMode(mode) {
      if (!["simple", "fruit", "number"].includes(mode)) return;
      this.renderMode = mode;
      window.localStorage.setItem("dropMergeRenderMode", mode);
      this.drawNext();
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
      if (this.pendingMerge.has(a.id) || this.pendingMerge.has(b.id)) return;

      this.pendingMerge.add(a.id);
      this.pendingMerge.add(b.id);

      if (a.plugin.level >= this.fruits.length - 1) {
        window.requestAnimationFrame(() => {
          Composite.remove(this.engine.world, [a, b]);
          this.score += this.fruits[a.plugin.level].score;
          this.updateScore();
          this.pendingMerge.delete(a.id);
          this.pendingMerge.delete(b.id);
        });
        return;
      }

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
      const overLine = fruitBodies.some((body) => {
        const age = now - body.plugin.bornAt;
        return age > 1400 && body.bounds.min.y < this.deadLineY;
      });

      if (overLine) {
        this.warningSince ||= now;
      } else {
        this.warningSince = 0;
      }

      if (this.warningSince && now - this.warningSince > 450) {
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
        const fruit = this.fruits[this.currentLevel];
        context.save();
        context.globalAlpha = 0.72;
        this.drawFruit(context, this.pointerX, this.dropY, fruit.radius, fruit);
        context.restore();
      }
    }

    drawFruit(context, x, y, radius, fruit) {
      if (this.renderMode === "fruit") {
        this.drawFruitIllustration(context, x, y, radius, fruit);
        return;
      }
      if (this.renderMode === "number") {
        this.drawNumberFruit(context, x, y, radius, fruit);
        return;
      }

      this.drawSimpleFruit(context, x, y, radius, fruit);
    }

    drawSimpleFruit(context, x, y, radius, fruit) {
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

    drawNumberFruit(context, x, y, radius, fruit) {
      const number = this.fruits.indexOf(fruit) + 1;
      this.drawSimpleFruit(context, x, y, radius, fruit);

      context.save();
      context.fillStyle = "rgba(255, 255, 255, 0.92)";
      context.strokeStyle = "rgba(29, 38, 39, 0.42)";
      context.lineWidth = Math.max(2, radius * 0.08);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `900 ${Math.max(14, radius * 0.92)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      context.strokeText(String(number), x, y + radius * 0.04);
      context.fillText(String(number), x, y + radius * 0.04);
      context.restore();
    }

    drawFruitIllustration(context, x, y, radius, fruit) {
      const index = this.fruits.indexOf(fruit);
      this.drawSimpleFruit(context, x, y, radius, {
        ...fruit,
        color: fruit.fruitColor || fruit.color,
        accent: fruit.fruitAccent || fruit.accent,
      });

      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";

      if (index === 0) {
        this.drawSeeds(context, x, y, radius, "#ffe3ea", 5);
      } else if (index === 1) {
        this.drawCitrusSegments(context, x, y, radius, "#efffa4", 6);
      } else if (index === 2) {
        this.drawCitrusSegments(context, x, y, radius, "#fff1a8", 8);
      } else if (index === 3) {
        this.drawStemAndLeaf(context, x, y, radius, "#5f3b22", "#68b45b");
      } else if (index === 4) {
        this.drawStemAndLeaf(context, x, y, radius, "#6c4a29", "#7fbf5b");
        this.drawPearBelly(context, x, y, radius);
      } else if (index === 5) {
        this.drawPeachLine(context, x, y, radius);
        this.drawStemAndLeaf(context, x, y, radius, "#6c4a29", "#6abf69");
      } else if (index === 6) {
        this.drawMelonStripes(context, x, y, radius, "#e7ffd2");
        this.drawStemAndLeaf(context, x, y, radius, "#5d3b24", "#5fae4c");
      } else if (index === 7) {
        this.drawCoconutFibers(context, x, y, radius);
      } else if (index === 8) {
        this.drawPineapplePattern(context, x, y, radius);
      } else {
        this.drawWatermelonPattern(context, x, y, radius);
      }

      context.restore();
    }

    drawSeeds(context, x, y, radius, color, count) {
      context.fillStyle = color;
      for (let i = 0; i < count; i += 1) {
        const angle = -Math.PI * 0.76 + i * 0.38;
        const sx = x + Math.cos(angle) * radius * 0.34;
        const sy = y + Math.sin(angle) * radius * 0.22 + radius * 0.1;
        context.beginPath();
        context.ellipse(sx, sy, radius * 0.07, radius * 0.13, angle, 0, Math.PI * 2);
        context.fill();
      }
    }

    drawCitrusSegments(context, x, y, radius, color, count) {
      context.strokeStyle = color;
      context.lineWidth = Math.max(1.5, radius * 0.055);
      context.beginPath();
      context.arc(x, y, radius * 0.67, 0, Math.PI * 2);
      context.stroke();
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + Math.cos(angle) * radius * 0.62, y + Math.sin(angle) * radius * 0.62);
        context.stroke();
      }
    }

    drawStemAndLeaf(context, x, y, radius, stemColor, leafColor) {
      context.strokeStyle = stemColor;
      context.lineWidth = Math.max(2, radius * 0.1);
      context.beginPath();
      context.moveTo(x - radius * 0.05, y - radius * 0.72);
      context.quadraticCurveTo(x, y - radius * 1.02, x + radius * 0.16, y - radius * 1.09);
      context.stroke();

      context.fillStyle = leafColor;
      context.beginPath();
      context.ellipse(x + radius * 0.33, y - radius * 0.96, radius * 0.23, radius * 0.12, -0.45, 0, Math.PI * 2);
      context.fill();
    }

    drawPearBelly(context, x, y, radius) {
      context.fillStyle = "rgba(255, 255, 255, 0.18)";
      context.beginPath();
      context.ellipse(x, y + radius * 0.22, radius * 0.55, radius * 0.36, 0, 0, Math.PI * 2);
      context.fill();
    }

    drawPeachLine(context, x, y, radius) {
      context.strokeStyle = "rgba(116, 46, 43, 0.42)";
      context.lineWidth = Math.max(2, radius * 0.06);
      context.beginPath();
      context.moveTo(x + radius * 0.18, y - radius * 0.62);
      context.bezierCurveTo(x - radius * 0.18, y - radius * 0.16, x - radius * 0.06, y + radius * 0.35, x - radius * 0.28, y + radius * 0.68);
      context.stroke();
    }

    drawMelonStripes(context, x, y, radius, color) {
      context.save();
      context.beginPath();
      context.arc(x, y, radius * 0.9, 0, Math.PI * 2);
      context.clip();

      context.strokeStyle = color;
      context.lineWidth = Math.max(1.5, radius * 0.035);
      for (let i = -5; i <= 5; i += 1) {
        context.beginPath();
        context.moveTo(x - radius * 0.95, y + i * radius * 0.18);
        context.lineTo(x + radius * 0.95, y + (i + 2.6) * radius * 0.18);
        context.stroke();

        context.beginPath();
        context.moveTo(x + radius * 0.95, y + i * radius * 0.18);
        context.lineTo(x - radius * 0.95, y + (i + 2.6) * radius * 0.18);
        context.stroke();
      }
      context.restore();
    }

    drawCoconutFibers(context, x, y, radius) {
      context.strokeStyle = "rgba(248, 224, 194, 0.54)";
      context.lineWidth = Math.max(1.5, radius * 0.032);
      for (let i = -4; i <= 4; i += 1) {
        context.beginPath();
        context.moveTo(x - radius * 0.72, y + i * radius * 0.12);
        context.quadraticCurveTo(x - radius * 0.04, y + i * radius * 0.03, x + radius * 0.72, y - i * radius * 0.08);
        context.stroke();
      }

      context.fillStyle = "#2b1b14";
      for (let i = 0; i < 3; i += 1) {
        context.beginPath();
        context.arc(x + (i - 1) * radius * 0.16, y - radius * 0.23 + Math.abs(i - 1) * radius * 0.06, radius * 0.075, 0, Math.PI * 2);
        context.fill();
      }
    }

    drawPineapplePattern(context, x, y, radius) {
      context.save();
      context.beginPath();
      context.arc(x, y, radius * 0.88, 0, Math.PI * 2);
      context.clip();

      context.strokeStyle = "rgba(122, 76, 18, 0.35)";
      context.lineWidth = Math.max(2, radius * 0.045);
      for (let i = -6; i <= 6; i += 1) {
        context.beginPath();
        context.moveTo(x - radius * 0.95, y + i * radius * 0.24);
        context.lineTo(x + radius * 0.95, y + (i + 3.6) * radius * 0.24);
        context.stroke();

        context.beginPath();
        context.moveTo(x + radius * 0.95, y + i * radius * 0.24);
        context.lineTo(x - radius * 0.95, y + (i + 3.6) * radius * 0.24);
        context.stroke();
      }
      context.restore();

      context.fillStyle = "rgba(50, 120, 56, 0.9)";
      for (let i = -2; i <= 2; i += 1) {
        context.beginPath();
        context.ellipse(x + i * radius * 0.11, y - radius * 0.73, radius * 0.11, radius * 0.36, i * 0.28, 0, Math.PI * 2);
        context.fill();
      }
    }

    drawWatermelonPattern(context, x, y, radius) {
      context.strokeStyle = "rgba(171, 232, 96, 0.78)";
      context.lineWidth = Math.max(4, radius * 0.075);
      for (let i = -4; i <= 4; i += 1) {
        context.beginPath();
        context.ellipse(x + i * radius * 0.12, y, radius * 0.13, radius * 0.82, 0, 0, Math.PI * 2);
        context.stroke();
      }

      context.fillStyle = "rgba(18, 43, 26, 0.62)";
      for (let i = -3; i <= 3; i += 1) {
        const sx = x + i * radius * 0.17;
        const sy = y + (i % 2) * radius * 0.15;
        context.beginPath();
        context.ellipse(sx, sy, radius * 0.04, radius * 0.075, 0.18, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  window.DropMergeGame = DropMergeGame;
})();
