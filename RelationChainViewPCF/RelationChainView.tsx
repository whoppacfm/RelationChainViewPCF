//React
import {IInputs, IOutputs} from "./generated/ManifestTypes";
import React, { useState, useEffect } from 'react';
import * as ReactDOM from 'react-dom';
import internal from 'stream';
import { isContext } from 'vm';

function RelationChainView(props:any) {
    
    /*
      Test Config

      [
        { "active":0, "stage":0, "entname":"dev_basecomplex", "fields":[{"name":"dev_name", "type":"string"}], "lookupfields":["dev_superproductid"] },
        { "active":0, "stage":1, "entname":"dev_superproduct", "fields":[{"name":"dev_name", "type":"string"}], "lookupfields":["dev_complexcomponentid", "dev_specialcomponentid"] },
        { "active":1, "stage":2, "entname":"dev_complexcomponent", "fields":[{"name":"dev_name", "type":"string"}], "lookupfields":["dev_component1id", "dev_component2id"] },
        { "active":0, "stage":2, "entname":"dev_specialcomponent", "fields":[{"name":"dev_name", "type":"string"}], "lookupfields":[] },
        { "active":0, "stage":3, "entname":"dev_customcomponent", "fields":[{"name":"dev_name", "type":"string"}], "lookupfields":["dev_product1id","dev_product2id"] },
        { "active":0, "stage":4, "entname":"product", "fields":[{"name":"name", "type":"string"}], "lookupfields":[] }
      ]
    */

    interface IField {
      name:string;
      type:string;
    }

    interface IConfigEntry {
      active: number;
      stage: number;
      entname: string;
      fields: Array<IField>;
      lookupfields: Array<string>;
    }

    interface IChainObject {
      values: Array<string>
    }

    const [chainData, setChainData] = React.useState({ 
      chainData: new Array<IChainObject>()
    });

    function FetchDataForEntry(entry:IConfigEntry, condfield:string, recordid:string) {

      return new Promise((resolve, reject) => {

          let values: Array<string> = new Array<string>();
          let context = props.context;

          let fields = "";
          for(let i=0;i<entry.fields.length;i++) {
            fields += "<attribute name='"+entry.fields[i].name+"' />"
          }
          for(let i=0;i<entry.lookupfields.length;i++) {
            fields += "<attribute name='"+entry.lookupfields[i]+"' />"
          }
          
          let fetchXML = `<fetch distinct='false' mapping='logical'>
                            <entity name='`+entry.entname+`'>
                              FIELDS
                              <filter>
                                <condition attribute='COND_FIELD' operator='eq' value='COND_ID' />   
                              </filter>
                            </entity>
                          </fetch>`;

          fetchXML = fetchXML.replace("FIELDS", fields);
          fetchXML = fetchXML.replace("COND_ID", recordid);
          if(condfield=="") {
            condfield =  entry.entname+"id";
          }
          fetchXML = fetchXML.replace("COND_FIELD", condfield);

          console.log("Fetch records fetchxml: " + fetchXML);

          context.webAPI.retrieveMultipleRecords(entry.entname, `?fetchXml=${fetchXML}`).then(
            (response: ComponentFramework.WebApi.RetrieveMultipleResponse) => {
              console.log("result entities: " + response.entities);
              console.log("result count: " + response.entities.length);
              resolve(response.entities);
            },
            (errorResponse:any) => {
              console.error("Error fetching records: " + errorResponse);
              resolve("");
              }
            );
          })
    }

    let params = props.context.parameters;
    let paramsArr = JSON.parse(params.configProperty.raw);
		let entityId = (props.context.mode as any).contextInfo.entityId;
		let entityTypeName = (props.context.mode as any).contextInfo.entityTypeName;
    let entityRecordName = (props.context.mode as any).contextInfo.entityRecordName;

    let currentEntry: IConfigEntry = {} as IConfigEntry;
    let currentStage = 0;

    for(var i=0;i<paramsArr.length;i++) {
      if(paramsArr[i].active == 1) {
        currentEntry = paramsArr[i];
        currentStage = paramsArr[i].stage;
        break;
      }
    }
    
    function FetchEntryRecursive(entry:IConfigEntry, condfield:string, entityId:string, push:number) {
      FetchDataForEntry(entry, condfield, entityId).then(function(result:any) {

        result.map((record:ComponentFramework.WebApi.Entity) => {
          let chainObj:IChainObject = {values:[]};

          entry.fields.map((field:IField) => {
            let val1 = record[field.name];
            chainObj.values.push(val1);
          });

          if(push==1) {
            chainData.chainData.push(chainObj);
          }
          else{
            chainData.chainData = [chainObj].concat(chainData.chainData);
          }

          if(push==1 || push==2) {
            entry.lookupfields.map((field:string) => {
              let nextEntName=record["_"+field+"_value@Microsoft.Dynamics.CRM.lookuplogicalname"];
              let nextRecId=record["_"+field+"_value"];
              let nextEntry:IConfigEntry= {} as IConfigEntry;
              const res1 = (paramsArr as Array<IConfigEntry>).filter(item => (item.stage==(entry.stage+1)) && (item.entname == nextEntName));
              if(res1.length>0) {
                nextEntry = res1[0];
                FetchEntryRecursive(nextEntry, "", nextRecId, 1);
              }
            });
          }
          
          if(push==0 || push==2) { 
            const res1 = (paramsArr as Array<IConfigEntry>).filter(item => (item.stage==(entry.stage-1)));
            let previousEntry:IConfigEntry = {} as IConfigEntry;
            if(res1.length>0) {
              previousEntry = res1[0];
              previousEntry.lookupfields.map((lfield:string) => {
                FetchEntryRecursive(previousEntry, lfield, entityId, 0);
              });
            }
          }
        });
        
        setChainData({ chainData: chainData.chainData });

      }, function(err) {
        console.error("Error Fetch: " + err);
      });
    }

    React.useEffect(() => {
      FetchEntryRecursive(currentEntry, "", entityId, 2);
    }, []);

    const stageStyle1:any = { float:"left", border:"1px solid grey", padding:"10px", overflow:"auto", marginRight:"10px", marginBottom:"20px", scrollbarWidth: "thin" };
    return (
      <>
        {chainData.chainData.map((item:IChainObject, i:number) => (
          <div style={stageStyle1}>
            {item.values.map((val:string, i:number) => (
              <p>
                {val}
                <br/>
              </p>
            ))}
          </div>          
        ))}
      </>
    );
}

export function Render(context:ComponentFramework.Context<IInputs>, container:HTMLDivElement) {
    ReactDOM.render(
            <div><RelationChainView context={context} /></div>
        , container
      );
}

