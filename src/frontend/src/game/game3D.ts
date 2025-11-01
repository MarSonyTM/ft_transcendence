import { PongGame } from './PongGame';
import { CoreGameState as GameState } from '../../../shared/gameTypes';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Effect } from '@babylonjs/core/Materials/effect';
import '@babylonjs/core/Shaders/default.vertex';
import '@babylonjs/core/Shaders/default.fragment';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';

interface PaddleMeshes {
    left?: AbstractMesh;
    right?: AbstractMesh;
    top?: AbstractMesh;
    bottom?: AbstractMesh;
}

interface BorderMeshes {
    north?: AbstractMesh;
    south?: AbstractMesh;
    east?: AbstractMesh;
    west?: AbstractMesh;
}

export class baby3D {
    private engine!: Engine;
    private scene!: Scene;
    private camera!: ArcRotateCamera;
    private light!: HemisphericLight;
    private table!: AbstractMesh;
    private ball!: AbstractMesh;
    private borders: BorderMeshes = {};
    private paddles: PaddleMeshes = {};
    private mode: string;
    private initialized = false;

    private values: {
        min: number,
        tableX: number,
        tableY: number,
        paddleX: number,
        paddleY: number,
        defaultPaddlePos: number,
        ballDiameter: number,
        lift: number,
        lastBallX?: number,
        lastBallY?: number
    }

    constructor(private game?: PongGame) {
        this.mode = (game?.gameState.mode === '4P') ? '4P' : '2P';
        this.values = {
            min: 0,
            tableX: 400,
            tableY: (game?.gameState.mode === '4P') ? 400 : 200,
            paddleX: (game?.gameState.mode === '4P') ? 80 : 60,
            paddleY: 10,
            defaultPaddlePos: (game?.gameState.mode === '4P') ? 160 : 70,
            ballDiameter: 10,
            lift: 3
        };
        if (this.game) this.attachGame(this.game);
    }

    attachGame(game: PongGame) {
        this.game = game;
        this.game.addStateListener(() => {
            const mode = (this.game?.gameState?.mode === '4P') ? '4P' : '2P';
            if (this.initialized && mode !== this.mode) {
                this.mode = mode;
                this.setupTable(mode);
                this.setupBall();
                this.setupPaddles(mode);
            }
        });
    }

    async createScene(): Promise<Scene> {        
        // if (!this.checkWebGLSupport())
        //     throw new Error('WebGL is not supported in this browser');
        await new Promise(resolve => setTimeout(resolve, 100));
        
        let canvas = document.getElementById('renderCanvas') as HTMLCanvasElement | null;
        if (!canvas) {
            console.log('⚠️ [3D] Canvas not found, creating new one');
            canvas = document.createElement('canvas');
            canvas.id = 'renderCanvas';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';
            canvas.style.touchAction = 'none';
            const gameContainer = document.getElementById('gameContainer') 
                || document.querySelector('.game-container')
                || document.body;
            gameContainer.appendChild(canvas);
            console.log('✅ [3D] Canvas created and appended to:', gameContainer.id || 'body');
        }

        this.engine = new Engine(canvas);

        this.scene = new Scene(this.engine);
        this.scene.clearColor = new Color4(0.04, 0.06, 0.10, 1);

        if (!ShaderStore.ShadersRepository || ShaderStore.ShadersRepository === "") {
            ShaderStore.ShadersRepository = "https://cdn.babylonjs.com/shaders/";
        }

        const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env && !(import.meta as any).env.PROD;
        const urlHasDebug = typeof window !== 'undefined' && window.location && /(^|[?&])shaderDebug=1(&|$)/.test(window.location.search);
        let lsHasDebug = false;
        try {
            lsHasDebug = typeof window !== 'undefined' && !!window.localStorage && window.localStorage.getItem('shaderDebug') === '1';
        } catch {}
        if (isDev || urlHasDebug || lsHasDebug) {
            this.scene.onNewMaterialAddedObservable.add(mat => {
                (mat as any).onError = (effect: Effect, errors: string) => {
                    try {
                        const anyEff = effect as any;
                        const vs: string = anyEff.getVertexShaderSource?.() || anyEff._vertexSourceCode || '';
                        const fs: string = anyEff.getFragmentShaderSource?.() || anyEff._fragmentSourceCode || '';
                        const numberize = (code: string) => code
                            .split('\n')
                            .map((l, i) => `${(i + 1).toString().padStart(4, ' ')} | ${l}`)
                            .join('\n');
                        console.error('[Babylon Shader Compile Error]', {
                            material: mat.name,
                            errors
                        });
                        if (vs) {
                            console.log('[Vertex Shader Source]\n' + numberize(vs));
                        }
                        if (fs) {
                            console.log('[Fragment Shader Source]\n' + numberize(fs));
                        }
                    } catch (e) {
                        console.error('[Shader Error Logger Failed]', e);
                    }
                };
            });
        }

        this.setupCameraLight(canvas);

        const initMode = this.game?.gameState.mode === '4P' ? '4P' : '2P';
        this.setupTable(initMode);
        this.setupBall();
        this.setupPaddles(initMode);
        this.mode = initMode;
        this.initialized = true;

        // Start render loop with error handling
        this.engine.runRenderLoop(() => {
            try {
                if (this.scene && !this.scene.isDisposed) {
                    this.syncFromGameState();
                    this.scene.render();
                }
            } catch (e) {
                console.error('[3D] Render loop error:', e);
                this.engine.stopRenderLoop();
            }
        });

        window.addEventListener('resize', () => {
            this.engine.resize();
            // this.fitCameraToTable();
        });

        if (canvas.parentElement && 'ResizeObserver' in window) {
            const ro = new ResizeObserver(() => {
                this.engine?.resize();
                // this.fitCameraToTable();
            });
            ro.observe(canvas.parentElement);
        }

        return this.scene;
    }

    // private checkWebGLSupport(): boolean {
    //     console.log('🔍 [3D] Checking WebGL support...');
    //     try {
    //         const canvas = document.createElement('canvas');
    //         const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    //         const supported = !!(window.WebGLRenderingContext && gl);
    //         console.log(supported ? '✅ [3D] WebGL is supported' : '❌ [3D] WebGL is NOT supported');
    //         return supported;
    //     } catch(e) {
    //         console.error('❌ [3D] WebGL check failed:', e);
    //         return false;
    //     }
    // }

    private setupCameraLight(canvas: HTMLCanvasElement) {
        this.camera = new ArcRotateCamera(
            'cam', 
            Math.PI / 2 + Math.PI, 
            0.95, 
            350, 
            new Vector3(0, 0, 0), 
            this.scene
        );
        this.camera.lowerBetaLimit = 0.6;
        this.camera.upperBetaLimit = 1.3;
        this.camera.attachControl(canvas, true);

        this.light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
        this.light.intensity = 0.85;
    }

    // private fitCameraToTable(marginScale = 1.1) {//TODO: maybe use this but fix it first, works well without at the moment though
    //     if (!this.camera || !this.engine) return;

    //     const halfW = this.values.tableX / 2;
    //     const halfH = this.values.tableY / 2;

    //     const aspect = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    //     const fov = this.camera.fov;

    //     const distV = halfH / Math.tan(fov / 2);
    //     const distH = halfW / (Math.tan(fov / 2) * aspect);
    //     const minRadius = Math.max(distV, distH) * marginScale;

    //     this.camera.radius = Math.max(minRadius, 1);
    // }

    private setupTable(mode: '2P' | '4P') {
        this.table?.dispose();
        this.borders.north?.dispose();
        this.borders.south?.dispose();
        this.borders.east?.dispose();
        this.borders.west?.dispose();

        const tableMat = new StandardMaterial('tableMat', this.scene);
        tableMat.diffuseColor = new Color3(0.05, 0.45, 0.1);
        const borderMat = new StandardMaterial('borderMat', this.scene);
        const thickness = 0;

        this.table = MeshBuilder.CreateGround('table', { width: this.values.tableX, height: this.values.tableY }, this.scene);
        this.table.material = tableMat;

        const north = MeshBuilder.CreateBox('northBorder', { width: this.values.tableX, height: 0.1, depth: thickness }, this.scene);
        north.position = new Vector3(0, 0.1, this.values.tableY / 2);
        north.material = borderMat;

        const south = north.clone('southBorder');
        south.position.z = -this.values.tableY / 2;

        const west = MeshBuilder.CreateBox('westBorder', { width: thickness, height: 0.1, depth: this.values.tableY }, this.scene);
        west.position = new Vector3(-this.values.tableX / 2, 0.1, 0);
        west.material = borderMat;

        const east = west.clone('eastBorder');
        east.position.x = this.values.tableX / 2;

        this.borders = { north, south, east, west };

        // this.fitCameraToTable();
        this.camera.radius = (mode === '4P') ? 600 : 350;
    }

    private setupBall() {
        this.ball?.dispose();

        const ballMat = new StandardMaterial('ballMat', this.scene);
        ballMat.diffuseColor = new Color3(1, 0.95, 0.4);
        this.ball = MeshBuilder.CreateSphere('ball', { diameter: this.values.ballDiameter }, this.scene);
        this.ball.position = new Vector3(0, this.values.lift, 0);
        this.ball.material = ballMat;
    }

    private setupPaddles(mode: '2P' | '4P') {
        Object.values(this.paddles).forEach(m => m?.dispose());
        this.paddles = {};

        const makeMat = (name: string, color: Color3) => {
            const m = new StandardMaterial(name, this.scene);
            m.diffuseColor = color;
            return m;
        };

        const halfW = (mode === '4P') ? this.values.tableX / 2 : this.values.tableX / 2;
        const halfH = (mode === '4P') ? this.values.tableY / 2 : this.values.tableY / 2;

        if (this.mode === '2P') {
            const left = MeshBuilder.CreateBox('paddle_left', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
            left.position = new Vector3(-halfW + this.values.paddleY / 2, this.values.lift, 0);
            left.material = makeMat('mat_left', new Color3(1, 0.2, 0.2)); // Red - Player 1

            const right = MeshBuilder.CreateBox('paddle_right', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
            right.position = new Vector3(halfW - this.values.paddleY / 2, this.values.lift, 0);
            right.material = makeMat('mat_right', new Color3(0.2, 0.5, 1)); // Blue - Player 2

            this.paddles = { left, right };
        } else {
            const left = MeshBuilder.CreateBox('paddle_left', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
            left.position = new Vector3(-halfW + this.values.paddleY / 2, this.values.lift, 0);
            left.material = makeMat('mat_left', new Color3(1, 0.2, 0.2)); // Red - Player 1

            const top = MeshBuilder.CreateBox('paddle_top', { width: this.values.paddleX, height: this.values.paddleY, depth: this.values.paddleY }, this.scene);
            top.position = new Vector3(0, this.values.lift, halfH - this.values.paddleY / 2);
            top.material = makeMat('mat_top', new Color3(0.2, 0.5, 1)); // Blue - Player 2

            const right = MeshBuilder.CreateBox('paddle_right', { width: this.values.paddleY, height: this.values.paddleY, depth: this.values.paddleX }, this.scene);
            right.position = new Vector3(halfW - this.values.paddleY / 2, this.values.lift, 0);
            right.material = makeMat('mat_right', new Color3(1, 1, 0.2)); // Yellow - Player 3
            
            const bottom = MeshBuilder.CreateBox('paddle_bottom', { width: this.values.paddleX, height: this.values.paddleY, depth: this.values.paddleY }, this.scene);
            bottom.position = new Vector3(0, this.values.lift, -halfH + this.values.paddleY / 2);
            bottom.material = makeMat('mat_bottom', new Color3(0.2, 1, 0.2)); // Green - Player 4

            this.paddles = { left, top, right, bottom };
        }
    }

    private syncFromGameState() {
        if (!this.game) return;
        const state: GameState = this.game.gameState;
        if (!state) return;

        if (state.mode !== this.mode) {
            this.setupTable(state.mode === '4P' ? '4P' : '2P');
            this.setupBall();
            this.setupPaddles(state.mode === '4P' ? '4P' : '2P');
            this.mode = state.mode === '4P' ? '4P' : '2P';
            // this.fitCameraToTable();
        }

        const halfX = this.values.tableX / 2;
        const halfY = this.values.tableY / 2;

        const toWorldX = (canvasX: number) => (canvasX - halfX);
        const toWorldZ = (canvasY: number) => (halfY - canvasY);

        if (this.ball) {
            const maxX = this.values.tableX;
            const maxY = this.values.tableY;
            const ballX = Number((state as any).ballPosX);
            const ballY = Number((state as any).ballPosY);
            const validBallX = Number.isFinite(ballX) && ballX > 0 && ballX < maxX;
            const validBallY = Number.isFinite(ballY) && ballY > 0 && ballY < maxY;

            if (validBallX) this.values.lastBallX = ballX ?? maxX / 2;
            if (validBallY) this.values.lastBallY = ballY ?? maxY / 2;

            this.ball.position.x = toWorldX(this.values.lastBallX!);
            this.ball.position.z = toWorldZ(this.values.lastBallY!);
            this.ball.position.y = this.values.lift;
        }

        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

        const leftIdx = 0;
        const topIdx = this.mode === '4P' ? 1 : undefined;
        const rightIdx = this.mode === '2P' ? 1 : 2;
        const bottomIdx = this.mode === '4P' ? 3 : undefined;

        const left = Number.isFinite(Number(state.players?.[leftIdx]?.pos))
            ? Number(state.players?.[leftIdx]!.pos)
            : this.values.defaultPaddlePos;
        const top = (topIdx !== undefined && Number.isFinite(Number(state.players?.[topIdx]?.pos)))
            ? Number(state.players?.[topIdx]!.pos)
            : this.values.defaultPaddlePos;
        const right = Number.isFinite(Number(state.players?.[rightIdx]?.pos))
            ? Number(state.players?.[rightIdx]!.pos)
            : this.values.defaultPaddlePos;
        const bottom = (bottomIdx !== undefined && Number.isFinite(Number(state.players?.[bottomIdx]?.pos)))
            ? Number(state.players?.[bottomIdx]!.pos)
            : this.values.defaultPaddlePos;

        const paddleLen = this.values.paddleX;
        const lrMinY = -halfY + paddleLen / 2;
        const lrMaxY = halfY - paddleLen / 2;
        const tbMinX = -halfX + paddleLen / 2;
        const tbMaxX = halfX - paddleLen / 2;

        if (this.mode === '2P') {
            if (this.paddles.left != undefined) {
                const cz = toWorldZ(left + this.values.paddleX / 2);
                this.paddles.left.position.z = clamp(cz, lrMinY, lrMaxY);
                this.paddles.left.position.y = this.values.lift;
            }
            if (this.paddles.right != undefined) {
                const cz = toWorldZ(right + this.values.paddleX / 2);
                this.paddles.right.position.z = clamp(cz, lrMinY, lrMaxY);
                this.paddles.right.position.y = this.values.lift;
            }
        } else {
            if (this.paddles.left != undefined) {
                const cz = toWorldZ(left + this.values.paddleX / 2);
                this.paddles.left.position.z = clamp(cz, lrMinY, lrMaxY);
                this.paddles.left.position.y = this.values.lift;
            }
            if (this.paddles.top != undefined) {
                const cx = toWorldX(top + this.values.paddleX / 2);
                this.paddles.top.position.x = clamp(cx, tbMinX, tbMaxX);
                this.paddles.top.position.y = this.values.lift;
            }
            if (this.paddles.right != undefined) {
                const cz = toWorldZ(right + this.values.paddleX / 2);
                this.paddles.right.position.z = clamp(cz, lrMinY, lrMaxY);
                this.paddles.right.position.y = this.values.lift;
            }
            if (this.paddles.bottom != undefined) {
                const cx = toWorldX(bottom + this.values.paddleX / 2);
                this.paddles.bottom.position.x = clamp(cx, tbMinX, tbMaxX);
                this.paddles.bottom.position.y = this.values.lift;
            }
        }
    }
}