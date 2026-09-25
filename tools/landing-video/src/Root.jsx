import React from 'react';
import { Composition } from 'remotion';
import { FlowVideo } from './FlowVideo.jsx';
import { getTiming } from './data/timing.js';
import { FORMATS } from './canvasSizes.js';

const FLOW_LIST = ['venda', 'fiado', 'zelinho'];

export const Root = () => {
  return (
    <>
      {FLOW_LIST.map((flow) =>
        Object.entries(FORMATS).map(([format, size]) => {
          const timing = getTiming(flow, format);
          return (
            <Composition
              key={`${flow}-${format}`}
              id={`${flow}-${format}`}
              component={FlowVideo}
              durationInFrames={timing.totalFrames}
              fps={timing.fps}
              width={size.width}
              height={size.height}
              defaultProps={{ flow, format }}
            />
          );
        }),
      )}
    </>
  );
};
