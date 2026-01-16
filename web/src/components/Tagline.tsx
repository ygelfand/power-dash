import { Text } from "@mantine/core";
import { useState, useEffect } from "react";
import classes from "../App.module.css";

export function Tagline() {
  const lines = [
    "Powering your insights.",
    "Watt's going on?",
    "Energy at your fingertips.",
    "Shockingly good data.",
    "Current events, visualized.",
    "Keeping tabs on every joule.",
    "Where every watt counts.",
    "Turning load into knowledge.",
    "Direct current, indirect wisdom.",
    "Low noise. High signal.",
    "AC, DC, and everything in between.",
  ];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % lines.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text c="dimmed" size="sm" className={classes.tagline}>
      {lines[index]}
    </Text>
  );
}
