import uPlot from 'uplot';

// Simple bar path builder for uPlot
export function bars({ size = [0.6, 100] } = {}): uPlot.Series.Paths {
    const render: uPlot.Series.PathBuilder = (u: uPlot, seriesIdx: number, idx0: number, idx1: number) => {
        const { ctx } = u;
        const [widthPct, maxWidth] = size;

        const row = u.data[0] as number[];
        const col = u.data[seriesIdx] as (number | null)[];
        const scaleKey = u.series[seriesIdx].scale as string;

        const stroke = u.series[seriesIdx].stroke;
        if (stroke) {
            ctx.fillStyle = typeof stroke === 'function' ? (stroke(u, seriesIdx) as string) : (stroke as string);
        }

        for (let i = idx0; i <= idx1; i++) {
            const val = col[i];
            if (val == null) continue;

            const xVal = u.valToPos(row[i], 'x', true);
            let yVal = u.valToPos(val, scaleKey, true);
            const baseVal = u.valToPos(0, scaleKey, true);

            if (!Number.isFinite(xVal) || !Number.isFinite(yVal) || !Number.isFinite(baseVal)) {
                continue;
            }

            // Calculate width
            let width = (u.bbox.width / row.length) * widthPct;
            if (maxWidth > 0) width = Math.min(width, maxWidth);

            let height = baseVal - yVal;
            
            // Ensure 0 values have a visible line (1px)
            if (Math.abs(height) < 1) {
                height = val >= 0 ? 1 : -1;
                // Adjust yVal if we forced height
                if (val >= 0) yVal = baseVal - 1;
            }

            ctx.fillRect(
                xVal - width / 2,
                yVal,
                width,
                height
            );
        }

        return null; // tell uPlot we handled drawing
    };

    return render as unknown as uPlot.Series.Paths;
}