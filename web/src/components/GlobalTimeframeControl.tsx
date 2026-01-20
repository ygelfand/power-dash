import { SegmentedControl } from "@mantine/core";
import { useGlobalTimeframe } from "../contexts/TimeframeContext";
import classes from "./GlobalTimeframeControl.module.scss";

export function GlobalTimeframeControl() {
  const { globalTimeframe, setGlobalTimeframe, isMixed } = useGlobalTimeframe();

  return (
    <SegmentedControl
      value={globalTimeframe}
      onChange={(val) => {
        setGlobalTimeframe(val);
      }}
      onClick={() => {
        // If we are in mixed state, any click on the control should unify the dashboard
        if (isMixed) {
          setGlobalTimeframe(globalTimeframe);
        }
      }}
      size="md"
      radius="sm"
      data={[
        { label: "1h", value: "1h" },
        { label: "1d", value: "24h" },
        { label: "1w", value: "7d" },
        { label: "1m", value: "30d" },
        { label: "1y", value: "1y" },
        { label: "All", value: "all" },
      ]}
      classNames={classes}
      {...({ "data-mixed": isMixed } as any)}
    />
  );
}
