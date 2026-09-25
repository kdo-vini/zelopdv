import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  OffthreadVideo,
  Freeze,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { Background } from './components/Background.jsx';
import { PhoneFrame } from './components/PhoneFrame.jsx';
import { BrowserFrame } from './components/BrowserFrame.jsx';
import { TapRipple } from './components/TapRipple.jsx';
import { Caption } from './components/Caption.jsx';
import { EndCard } from './components/EndCard.jsx';
import { AnswerCard } from './components/AnswerCard.jsx';
import { buildCameraKeyframes, useCameraFrame, clampDeviceBox } from './components/camera.js';
import { FLOWS, ZELINHO_ANSWER_LABEL } from './data/flows.js';
import { getTiming, sourceMsToFrame } from './data/timing.js';
import {
  CAPTION_SAFE_TOP_FRACTION,
  DESKTOP_CAPTION_LEFT,
  DESKTOP_CAPTION_WIDTH,
  getCanvasSize,
  getDeviceGeometry,
} from './deviceGeometry.js';

export const FlowVideo = ({ flow, format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const data = FLOWS[flow][format];
  const timing = getTiming(flow, format);
  const canvas = getCanvasSize(format);
  const geom = React.useMemo(() => getDeviceGeometry(flow, format, data), [flow, format]);
  const keyframes = React.useMemo(
    () => buildCameraKeyframes({ events: data.events, timing, viewport: data.viewport, format }),
    [flow, format],
  );
  const { originX, originY, zoom: rawZoom } = useCameraFrame(frame, keyframes, fps);
  const {
    dx,
    dy,
    // clampDeviceBox pode reduzir o zoom (raramente, so quando a caixa ja
    // escalada seria maior que a propria area segura — ver camera.js) — usa
    // SEMPRE o zoom devolvido daqui pro transform, nunca o cru do keyframe.
    zoom,
  } = clampDeviceBox({
    zoom: rawZoom,
    originX,
    originY,
    frameWidth: geom.frameWidth,
    frameHeight: geom.frameHeight,
    baseLeft: geom.baseLeft,
    baseTop: geom.baseTop,
    safeLeft: geom.safeLeft,
    safeRight: geom.safeRight,
    safeTop: geom.safeTop,
    safeBottom: geom.safeBottom,
  });

  const isMobile = format === 'mobile';
  const { screenWidth, screenHeight } = geom;

  // Entrada do device: pequeno spring de escala/perspectiva que "assenta".
  const entrance = spring({ frame, fps, config: { damping: 15, mass: 0.7, stiffness: 110 } });
  const entranceScale = interpolate(entrance, [0, 1], [0.88, 1]);
  const entranceOpacity = interpolate(entrance, [0, 1], [0, 1]);
  const entranceRotate = interpolate(entrance, [0, 1], [7, 0]);

  const outroCaptionStart = timing.outroStartFrame - 2;
  const outroCaptionEnd = timing.outroStartFrame + 20;

  // Faixa reservada pra legenda no mobile (topo do quadro — ver
  // deviceGeometry.js). O device nunca pode invadi-la (clampDeviceBox acima
  // garante isso mesmo durante zoom/pan/entrada).
  const mobileCaptionBandHeight = canvas.height * CAPTION_SAFE_TOP_FRACTION;

  return (
    <AbsoluteFill>
      <Background />

      {isMobile ? (
        <AbsoluteFill>
          <div
            style={{
              position: 'absolute',
              zIndex: 10,
              top: 0,
              left: 0,
              right: 0,
              height: mobileCaptionBandHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 90px',
            }}
          >
            {data.captions.map((c, idx) => (
              <Caption
                key={idx}
                text={c.text}
                startFrame={sourceMsToFrame(c.startMs, timing)}
                endFrame={sourceMsToFrame(c.endMs, timing)}
                size={80}
              />
            ))}
            {flow !== 'zelinho' && (
              <Caption text={data.outro} startFrame={outroCaptionStart} endFrame={outroCaptionEnd} size={80} />
            )}
          </div>

          <div
            style={{
              position: 'absolute',
              left: geom.baseLeft,
              top: geom.baseTop,
              zIndex: 1,
              transform: `translate(${dx}px, ${dy}px)`,
            }}
          >
            <div
              style={{
                transform: `scale(${entranceScale}) rotateX(${entranceRotate}deg)`,
                opacity: entranceOpacity,
                transformStyle: 'preserve-3d',
              }}
            >
              <div style={{ transform: `scale(${zoom})`, transformOrigin: `${originX}% ${originY}%` }}>
                <PhoneFrame width={screenWidth} height={screenHeight}>
                  <VideoLayer data={data} timing={timing} />
                  <TapRipple
                    events={data.events}
                    timing={timing}
                    viewport={data.viewport}
                    screenWidth={screenWidth}
                    screenHeight={screenHeight}
                    frame={frame}
                  />
                </PhoneFrame>
              </div>
            </div>
          </div>
        </AbsoluteFill>
      ) : (
        <AbsoluteFill>
          <div
            style={{
              position: 'absolute',
              zIndex: 10,
              left: DESKTOP_CAPTION_LEFT,
              top: 0,
              bottom: 0,
              width: DESKTOP_CAPTION_WIDTH,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {data.captions.map((c, idx) => (
              <Caption
                key={idx}
                text={c.text}
                startFrame={sourceMsToFrame(c.startMs, timing)}
                endFrame={sourceMsToFrame(c.endMs, timing)}
                size={58}
                align="left"
              />
            ))}
            {flow !== 'zelinho' && (
              <Caption text={data.outro} startFrame={outroCaptionStart} endFrame={outroCaptionEnd} size={58} align="left" />
            )}
          </div>

          <div
            style={{
              position: 'absolute',
              left: geom.baseLeft,
              top: geom.baseTop,
              zIndex: 1,
              transform: `translate(${dx}px, ${dy}px)`,
            }}
          >
            <div style={{ transform: `scale(${entranceScale})`, opacity: entranceOpacity }}>
              <div style={{ transform: `scale(${zoom})`, transformOrigin: `${originX}% ${originY}%` }}>
                <BrowserFrame width={screenWidth} height={screenHeight}>
                  <VideoLayer data={data} timing={timing} />
                  <TapRipple
                    events={data.events}
                    timing={timing}
                    viewport={data.viewport}
                    screenWidth={screenWidth}
                    screenHeight={screenHeight}
                    frame={frame}
                  />
                </BrowserFrame>
              </div>
            </div>
          </div>
        </AbsoluteFill>
      )}

      {flow === 'zelinho' ? (
        // O AnswerCard É o cartão final do Zelinho (logo embutido, fade-in
        // tardio) — sem duration limite, roda até o fim da composição, igual
        // o <EndCard> faz pros outros fluxos. NÃO existe um <EndCard>
        // separado por cima dele: os dois nunca coexistem (ver
        // src/cardTiming.js pro raciocínio completo e o bug que isso
        // corrigiu — logo sobreposto ao número).
        <Sequence from={timing.answerStartFrame}>
          <AnswerCard
            startFrame={0}
            durationFrames={timing.answerFrames}
            value={data.answerValue}
            label={ZELINHO_ANSWER_LABEL}
            numberSize={isMobile ? 108 : 132}
            closingLine={data.outro}
            logoWidth={isMobile ? 200 : 240}
          />
        </Sequence>
      ) : (
        <Sequence from={timing.outroStartFrame}>
          <EndCard startFrame={0} logoWidth={isMobile ? 340 : 400} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

// Toca o clipe fonte segmento a segmento (timing.segments — ver
// data/timing.js): cada segmento tem sua propria janela do video fonte
// (trimBefore/trimAfter, em frames a 30fps) e taxa de reproducao
// (playbackRate) — trechos normais tocam numa taxa uniforme (baseRate),
// trechos "mortos" (loading parado etc.) tocam bem mais rapido, num
// orcamento curto e fixo de frames de saida (ver DEAD_ZONE_DEFAULT_FRAMES /
// `outputFrames` em data/flows.js). Depois do ultimo segmento, SEGURA
// (Freeze) o ultimo frame real ate o inicio do EndCard — evita a tela
// "apagar" pra um retangulo vazio antes do cartao final.
const VideoLayer = ({ data, timing }) => {
  const src = staticFile(data.src.replace(/^\//, ''));
  const toSourceFrame = (ms) => Math.round((ms / 1000) * timing.fps);
  const holdFrames = Math.max(1, timing.totalFrames - timing.videoEndFrame);
  const firstSeg = timing.segments[0];
  const lastSeg = timing.segments[timing.segments.length - 1];
  const lastSegFrames = lastSeg.compFrameEnd - lastSeg.compFrameStart;

  return (
    <>
      {/* Pre-roll: SEGURA o primeiro frame util do clipe fonte durante todo
          o intro (0..videoStartFrame), antes do primeiro <Sequence> de video
          comecar. Sem isso a moldura (PhoneFrame/BrowserFrame) fica com o
          fundo liso (`colors.bgApp`) enquanto o device faz o spring de
          entrada — ou seja, o quadro "nasce vazio" e so preenche de repente
          quando o video comeca a tocar. Como o video e um loop, isso pisca
          a cada volta (bug real encontrado na revisao). Usa o MESMO
          trimBefore/trimAfter/playbackRate do primeiro segmento — freeze no
          frame 0 local = exatamente o primeiro frame que o segmento real vai
          mostrar, entao a transicao pre-roll -> segmento real e imperceptivel. */}
      {timing.videoStartFrame > 0 && (
        <Sequence from={0} durationInFrames={timing.videoStartFrame} layout="none">
          <AbsoluteFill>
            <Freeze frame={0}>
              <OffthreadVideo
                src={src}
                playbackRate={firstSeg.playbackRate}
                trimBefore={toSourceFrame(firstSeg.startMs)}
                trimAfter={toSourceFrame(firstSeg.endMs)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                muted
              />
            </Freeze>
          </AbsoluteFill>
        </Sequence>
      )}
      {timing.segments.map((seg, idx) => (
        <Sequence
          key={idx}
          from={seg.compFrameStart}
          durationInFrames={seg.compFrameEnd - seg.compFrameStart}
          layout="none"
        >
          <AbsoluteFill>
            <OffthreadVideo
              src={src}
              playbackRate={seg.playbackRate}
              trimBefore={toSourceFrame(seg.startMs)}
              trimAfter={toSourceFrame(seg.endMs)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              muted
            />
          </AbsoluteFill>
        </Sequence>
      ))}
      <Sequence from={timing.videoEndFrame} durationInFrames={holdFrames} layout="none">
        <AbsoluteFill>
          <Freeze frame={lastSegFrames - 1}>
            <OffthreadVideo
              src={src}
              playbackRate={lastSeg.playbackRate}
              trimBefore={toSourceFrame(lastSeg.startMs)}
              trimAfter={toSourceFrame(lastSeg.endMs)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              muted
            />
          </Freeze>
        </AbsoluteFill>
      </Sequence>
    </>
  );
};
