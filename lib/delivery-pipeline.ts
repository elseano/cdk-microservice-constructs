import * as core from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { Pipeline, Artifact } from '@aws-cdk/aws-codepipeline';
import { Repository } from '@aws-cdk/aws-codecommit';
import { CodeCommitSourceAction, EcsDeployAction, CodeBuildAction } from '@aws-cdk/aws-codepipeline-actions';
import { EcsTask } from "@aws-cdk/aws-events-targets"
import { PipelineProject, LinuxBuildImage, BuildSpec, BuildEnvironmentVariable, PipelineProjectProps, Project, BuildEnvironment } from '@aws-cdk/aws-codebuild';
import { IBuildable, IHostable, IDeployment, Platform, IOutboundConnection } from './platform';
import { Grant, IRole } from '@aws-cdk/aws-iam';
import { EcsApplication, EcsDeploymentConfig, EcsDeploymentGroup } from '@aws-cdk/aws-codedeploy';
import { AwsCustomResource } from '@aws-cdk/custom-resources';
import { Lazy, CfnOutput } from '@aws-cdk/core';
import { Connections } from '@aws-cdk/aws-ec2';
import { Function, InlineCode, Runtime } from '@aws-cdk/aws-lambda';

export class DeliveryPipeline extends core.Construct implements IOutboundConnection {
  environmentVariables: { [key: string]: BuildEnvironmentVariable; } = {}
  buildRole: iam.IRole;
  buildSecurityGroup: any;
  allowIngress: Array<Connections> = []

  constructor(private readonly scope: core.Construct, private readonly id: string, private readonly platform: Platform, private readonly buildTarget: IBuildable & IDeployment) {
    super(scope, id)
  }

  setup() {
    const scope = this.scope
    const id = this.id
    const platform = this.platform
    const buildTarget = this.buildTarget

    const repo = new Repository(scope, id + "Repository", {
      repositoryName: buildTarget.canonicalName.toLowerCase()
    })

    new CfnOutput(this, "RepositoryCloneUrlSSH", { exportName: buildTarget.canonicalName + "RepositoryCloneUrlSSH", value: repo.repositoryCloneUrlSsh })
    new CfnOutput(this, "RepositoryCloneUrlHTTP", { exportName: buildTarget.canonicalName + "RepositoryCloneUrlHTTP", value: repo.repositoryCloneUrlHttp })

    const pipeline = new Pipeline(this, id, {
      pipelineName: buildTarget.canonicalName + "Pipeline",
      restartExecutionOnUpdate: true
    })

    const sourceOutput = new Artifact("RepositoryOutput")
    const sourceAction = new CodeCommitSourceAction({
      actionName: "Source",
      repository: repo,
      output: sourceOutput,
    })

    const buildImage = LinuxBuildImage.UBUNTU_14_04_DOCKER_18_09_0;

    pipeline.addStage({ stageName: "Source", actions: [sourceAction] })

    this.environmentVariables["CONTAINER_NAME"] = { value: "ServiceContainer" }
    this.environmentVariables["REPOSITORY_URI"] = { value: buildTarget.imageRepository.repositoryUri }

    // TODO: BUILD
    const buildProject = new PipelineProject(this, id + "Build", {
      buildSpec: BuildSpec.fromSourceFilename("./ci/buildspec.yml"),
      environmentVariables: this.environmentVariables,
      environment: {
        buildImage: buildImage,
        privileged: true
      },
      vpc: platform.vpc,
    });

    const buildOutput = new Artifact("BuildOutput")
    const buildAction = new CodeBuildAction({
      actionName: "Build",
      input: sourceOutput,
      outputs: [buildOutput],
      project: buildProject,
      
    })

    console.log("Setting up connections")
    this.allowIngress.forEach(connection => {
      connection.allowDefaultPortFrom(buildProject.connections.securityGroups[0])
    });
  
    Grant.addToPrincipal({
      grantee: (<IRole>buildProject.role).grantPrincipal,
      actions: ["ecr:*"],
      resourceArns: ["*"]
    })

    pipeline.addStage({ stageName: "Build", actions: [buildAction] })

    const deployAction = new EcsDeployAction({
      actionName: "Deploy",
      service: buildTarget.service,
      imageFile: buildOutput.atPath("imagedefinitions.json"),
      
    })

    pipeline.addStage({ stageName: "Deploy", actions: [deployAction]})

    // const postDeployment = new EcsTask({
    //   cluster: buildTarget.service.cluster,
    //   taskDefinition: buildTarget.service.taskDefinition,
    //   containerOverrides: [{
    //     containerName: "ServiceContainer",
    //     command: ["./tasks/post-deploy.sh"]
    //   }],
    //   taskCount: 1
    // })

    // deployAction.onStateChange("PostDeployment", postDeployment, {
    //   ruleName: `PostDeployment ${buildTarget.canonicalName}`,
    //   eventPattern: {
    //     detail: { state: "SUCCEEDED" }
    //   }
    // })

    // const postDeployInvocation = new Function(this, "PostDeployment", {
    //   code: new InlineCode(""),
    //   runtime: Runtime.PYTHON_3_7,
    //   handler: 
    // })
    // const postDeployAction = new LambdaInvokeAction({ actionName: "RunPostDeployment", lambda: })
  }

  addRouteTo(name: string, value: string) {
    this.environmentVariables[name] = { value }
  }

  allowIngressTo(connections : Connections) {
    this.allowIngress.push(connections)
  }
}