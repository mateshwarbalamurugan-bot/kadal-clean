import React, { useState } from 'react';
import DetectedObjectsTable from './DetectedObjectsTable';
import AccumulationGrid from './AccumulationGrid';
import TrajectoryCard from './TrajectoryCard';
import ExperimentRecorder from './ExperimentRecorder';
import ModelStatusCard from './ModelStatusCard';

export default function AdvancedAnalysis({
  analysisData,
  modelStatus,
  onReloadModel,
  predictionMethod,
  setPredictionMethod,
  predictionHorizon,
  setPredictionHorizon,
  trajectoryEvaluations,
  isRecording,
  onStartRecording,
  onStopRecording,
  currentSession,
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="advanced-section">
      <div className="advanced-toggle-bar">
        <button
          className="btn-accordion"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span>{isOpen ? '▲ Hide Advanced Analysis & Technical Telemetry' : '▼ Show Advanced Analysis & Technical Telemetry (Judges / Technical Review)'}</span>
          <span className="accordion-pill">{isOpen ? 'Expanded' : 'Optional'}</span>
        </button>
      </div>

      {isOpen && (
        <div className="advanced-content">
          <div className="advanced-grid">
            <DetectedObjectsTable
              trackedObjects={analysisData?.tracked_objects || []}
            />

            <AccumulationGrid
              accumulationData={analysisData?.accumulation_summary}
            />

            <TrajectoryCard
              predictionMethod={predictionMethod}
              setPredictionMethod={setPredictionMethod}
              predictionHorizon={predictionHorizon}
              setPredictionHorizon={setPredictionHorizon}
              trajectoryEvaluations={trajectoryEvaluations}
            />

            <ExperimentRecorder
              isRecording={isRecording}
              onStartRecording={onStartRecording}
              onStopRecording={onStopRecording}
              currentSession={currentSession}
            />

            <ModelStatusCard
              modelStatus={modelStatus}
              onReloadModel={onReloadModel}
            />
          </div>
        </div>
      )}
    </section>
  );
}
