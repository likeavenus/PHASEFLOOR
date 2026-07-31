import React, { useState, useEffect } from "react";
import { atom, useAtom } from "jotai";
import cn from "classnames";
import "./styles.scss";

export const slideAtom = atom(0);

export const Overlay = () => {
  const [slide, setSlide] = useState(slideAtom);
  const [displaySlide, setDisplaySlide] = useState(slide);
  const [visible, setVisible] = useState(false);

  // useEffect(() => {
  //   setTimeout(() => {
  //     setVisible(true);
  //   }, 1000);
  // }, []);

  // useEffect(() => {
  //   setVisible(false);
  //   setTimeout(() => {
  //     setDisplaySlide(slide);
  //     setVisible(true);
  //   }, 2600);
  // }, [slide]);

  return (
    <div className={cn("overlay")}>
      <svg
        onClick={() => setSlide((prev) => prev - 1)}
        className={cn("arrow")}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
      >
        <path
          d="M32 15H3.41l8.29-8.29-1.41-1.42-10 10a1 1 0 0 0 0 1.41l10 10 1.41-1.41L3.41 17H32z"
          data-name="4-Arrow Left"
        />
      </svg>
      <svg
        onClick={() => setSlide((prev) => prev + 1)}
        className={cn("arrow right")}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
      >
        <path
          d="M32 15H3.41l8.29-8.29-1.41-1.42-10 10a1 1 0 0 0 0 1.41l10 10 1.41-1.41L3.41 17H32z"
          data-name="4-Arrow Left"
        />
      </svg>
    </div>
  );
};
